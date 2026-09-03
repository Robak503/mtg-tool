package com.colton.omnathmodel

import android.app.Activity
import android.content.res.AssetManager
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
import java.io.FileOutputStream
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
@InvokeArg class AssetCopyArgs {
    var assetKind: String? = null
    var destinationName: String? = null
    var expectedBytes: Long = 0
    var expectedSha256: String? = null
}

private data class ModelSpec(val file: String, val bytes: Long, val sha256: String)

@TauriPlugin
class OmnathModelPlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lifecycle = ModelLifecycle()
    private val catalog = mapOf(
        "base" to ModelSpec("Gemma3-1B-IT_q8_ekv1280_Google_Tensor_G5.litertlm", 1678542365L, "1ed29548b302764ce32ebf03d7df8fff943218b76d14230e97ee4bd0224cd8d1"),
        "enhanced" to ModelSpec("gemma-4-E2B-it_Google_Tensor_G5.litertlm", 3113545589L, "af1082986639ecde7db95d91be6fe54f8b6b458104734c5bafc204e69d6852dc"),
    )
    @Volatile private var engine: Engine? = null
    @Volatile private var conversation: Conversation? = null
    @Volatile private var loading: Job? = null
    @Volatile private var generation: Job? = null

    private fun result(state: String, error: String? = null) = JSObject().apply {
        val snapshot = lifecycle.snapshot()
        put("state", state); put("modelId", snapshot.modelId); put("generating", snapshot.generating)
        if (error != null) put("error", error)
    }

    @Command fun status(invoke: Invoke) = invoke.resolve(result(lifecycle.snapshot().state))

    @Command fun loadModel(invoke: Invoke) {
        val id = invoke.parseArgs(ModelArgs::class.java).modelId ?: return invoke.reject("modelId is required")
        val spec = catalog[id] ?: return invoke.reject("Unknown modelId")
        val shouldLoad = try { lifecycle.beginLoad(id) } catch (error: IllegalStateException) { return invoke.reject(error.message ?: "Model is busy") }
        if (!shouldLoad) return invoke.resolve(result("ready"))
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
                engine = next; conversation = next.createConversation(); lifecycle.finishLoad(id)
                invoke.resolve(result("ready"))
            } catch (error: Throwable) { lifecycle.failLoad(id); invoke.reject(error.message ?: error.javaClass.simpleName) }
            finally { loading = null }
        }
    }

    @Command fun generate(invoke: Invoke) {
        val args = invoke.parseArgs(GenerateArgs::class.java)
        val requestId = args.requestId ?: return invoke.reject("requestId is required")
        val prompt = args.prompt?.takeIf { it.isNotBlank() } ?: return invoke.reject("prompt is required")
        val active = conversation ?: return invoke.reject("Model is not loaded")
        try { lifecycle.beginGeneration(requestId) } catch (error: IllegalStateException) { return invoke.reject(error.message ?: "Model is busy") }
        generation = scope.launch {
            val output = StringBuilder()
            try {
                active.sendMessageAsync(prompt).collect { message ->
                    val token = message.toString(); output.append(token)
                    trigger("token", JSObject().apply { put("requestId", requestId); put("token", token) })
                }
                invoke.resolve(JSObject().apply { put("requestId", requestId); put("text", output.toString()) })
            } catch (error: Throwable) { invoke.reject(error.message ?: error.javaClass.simpleName) }
            finally { lifecycle.finishGeneration(requestId); generation = null }
        }
    }

    @Command fun cancel(invoke: Invoke) {
        try { conversation?.javaClass?.methods?.firstOrNull { it.name == "cancelProcess" }?.invoke(conversation) } catch (_: Throwable) {}
        generation?.cancel(); generation = null; lifecycle.cancelGeneration()
        invoke.resolve(result(if (engine == null) "unloaded" else "ready"))
    }

    @Command fun unload(invoke: Invoke) {
        loading?.cancel(); loading = null; generation?.cancel(); generation = null; conversation?.close(); conversation = null; engine?.close(); engine = null; lifecycle.unload()
        invoke.resolve(result("unloaded"))
    }

    @Command fun benchmark(invoke: Invoke) {
        val info = try { conversation?.javaClass?.methods?.firstOrNull { it.name == "getBenchmarkInfo" }?.invoke(conversation)?.toString() } catch (_: Throwable) { null }
        invoke.resolve(JSObject().apply { put("modelId", lifecycle.snapshot().modelId); put("benchmark", info ?: "unavailable") })
    }

    @Command fun copyBundledAsset(invoke: Invoke) {
        val args = invoke.parseArgs(AssetCopyArgs::class.java)
        val spec = AssetCopyPolicy.spec(args.assetKind)
            ?: return invoke.reject("Unknown bundled asset")
        if (!AssetCopyPolicy.acceptsDestination(spec, args.destinationName)) {
            return invoke.reject("Invalid bundled asset destination")
        }
        val expectedSha256 = args.expectedSha256?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }
            ?: return invoke.reject("Invalid bundled asset receipt")
        if (args.expectedBytes <= 0) return invoke.reject("Invalid bundled asset size")

        scope.launch {
            val destination = File(activity.dataDir, args.destinationName!!)
            try {
                require(destination.canonicalFile.parentFile == activity.dataDir.canonicalFile) {
                    "Bundled asset destination escaped app storage"
                }
                val digest = MessageDigest.getInstance("SHA-256")
                var copiedBytes = 0L
                activity.assets.open(spec.assetPath, AssetManager.ACCESS_STREAMING).use { input ->
                    FileOutputStream(destination, false).use { output ->
                        val buffer = ByteArray(1024 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            output.write(buffer, 0, count)
                            digest.update(buffer, 0, count)
                            copiedBytes += count
                            trigger("asset-progress", JSObject().apply {
                                put("assetKind", spec.kind)
                                put("copiedBytes", copiedBytes)
                                put("totalBytes", args.expectedBytes)
                            })
                        }
                        output.fd.sync()
                    }
                }
                val actualSha256 = digest.digest().joinToString("") { "%02x".format(it) }
                require(copiedBytes == args.expectedBytes) { "Bundled asset size mismatch" }
                require(actualSha256 == expectedSha256) { "Bundled asset hash mismatch" }
                invoke.resolve(JSObject().apply {
                    put("assetKind", spec.kind)
                    put("bytes", copiedBytes)
                    put("sha256", actualSha256)
                })
            } catch (error: Throwable) {
                destination.delete()
                invoke.reject(error.message ?: error.javaClass.simpleName)
            }
        }
    }

    override fun onDestroy() { loading?.cancel(); generation?.cancel(); conversation?.close(); engine?.close(); lifecycle.unload(); scope.cancel(); super.onDestroy() }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
