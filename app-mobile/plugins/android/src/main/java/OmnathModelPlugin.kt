package com.colton.omnathmodel

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Conversation
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

@InvokeArg class ModelArgs { var modelId: String? = null }
@InvokeArg class GenerateArgs { var requestId: String? = null; var prompt: String? = null }

private data class ModelSpec(val file: String, val bytes: Long, val sha256: String)

@TauriPlugin
class OmnathModelPlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val catalog = mapOf(
        "base" to ModelSpec("Gemma3-1B-IT_q8_ekv1280_Google_Tensor_G5.litertlm", 1678542365L, "1ed29548b302764ce32ebf03d7df8fff943218b76d14230e97ee4bd0224cd8d1"),
        "enhanced" to ModelSpec("gemma-4-E2B-it_Google_Tensor_G5.litertlm", 3113545589L, "af1082986639ecde7db95d91be6fe54f8b6b458104734c5bafc204e69d6852dc"),
    )
    @Volatile private var engine: Engine? = null
    @Volatile private var conversation: Conversation? = null
    @Volatile private var loadedModelId: String? = null
    @Volatile private var loading: Job? = null
    @Volatile private var generation: Job? = null

    private fun result(state: String, error: String? = null) = JSObject().apply {
        put("state", state); put("modelId", loadedModelId); put("generating", generation?.isActive == true)
        if (error != null) put("error", error)
    }

    @Command fun status(invoke: Invoke) = invoke.resolve(result(if (loading?.isActive == true) "loading" else if (engine == null) "unloaded" else "ready"))

    @Command fun loadModel(invoke: Invoke) {
        val id = invoke.parseArgs(ModelArgs::class.java).modelId ?: return invoke.reject("modelId is required")
        val spec = catalog[id] ?: return invoke.reject("Unknown modelId")
        if (generation?.isActive == true) return invoke.reject("Generation is active")
        if (loading?.isActive == true) return invoke.reject("A model is already loading")
        if (engine != null && loadedModelId == id) return invoke.resolve(result("ready"))
        loading = scope.launch {
            try {
                val root = File(activity.getExternalFilesDir(null), "models")
                val model = File(root, spec.file).canonicalFile
                require(model.parentFile == root.canonicalFile) { "Model path escaped the catalog" }
                require(model.isFile) { "Model is not staged: ${spec.file}" }
                require(model.length() == spec.bytes) { "Model byte-count mismatch" }
                require(sha256(model) == spec.sha256) { "Model SHA-256 mismatch" }
                conversation?.close(); engine?.close()
                val next = Engine(EngineConfig(modelPath = model.path, backend = Backend.GPU(), cacheDir = activity.cacheDir.path))
                next.initialize()
                engine = next; conversation = next.createConversation(); loadedModelId = id
                invoke.resolve(result("ready"))
            } catch (error: Throwable) { invoke.reject(error.message ?: error.javaClass.simpleName) }
            finally { loading = null }
        }
    }

    @Command fun generate(invoke: Invoke) {
        val args = invoke.parseArgs(GenerateArgs::class.java)
        val requestId = args.requestId ?: return invoke.reject("requestId is required")
        val prompt = args.prompt?.takeIf { it.isNotBlank() } ?: return invoke.reject("prompt is required")
        val active = conversation ?: return invoke.reject("Model is not loaded")
        if (generation?.isActive == true) return invoke.reject("Generation is already active")
        generation = scope.launch {
            val output = StringBuilder()
            try {
                active.sendMessageAsync(prompt).collect { message ->
                    val token = message.toString(); output.append(token)
                    trigger("token", JSObject().apply { put("requestId", requestId); put("token", token) })
                }
                invoke.resolve(JSObject().apply { put("requestId", requestId); put("text", output.toString()) })
            } catch (error: Throwable) { invoke.reject(error.message ?: error.javaClass.simpleName) }
        }
    }

    @Command fun cancel(invoke: Invoke) {
        try { conversation?.javaClass?.methods?.firstOrNull { it.name == "cancelProcess" }?.invoke(conversation) } catch (_: Throwable) {}
        generation?.cancel(); generation = null
        invoke.resolve(result(if (engine == null) "unloaded" else "ready"))
    }

    @Command fun unload(invoke: Invoke) {
        loading?.cancel(); loading = null; generation?.cancel(); generation = null; conversation?.close(); conversation = null; engine?.close(); engine = null; loadedModelId = null
        invoke.resolve(result("unloaded"))
    }

    @Command fun benchmark(invoke: Invoke) {
        val info = try { conversation?.javaClass?.methods?.firstOrNull { it.name == "getBenchmarkInfo" }?.invoke(conversation)?.toString() } catch (_: Throwable) { null }
        invoke.resolve(JSObject().apply { put("modelId", loadedModelId); put("benchmark", info ?: "unavailable") })
    }

    override fun onDestroy() { loading?.cancel(); generation?.cancel(); conversation?.close(); engine?.close(); scope.cancel(); super.onDestroy() }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
