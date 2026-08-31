package com.colton.omnathmodel

internal data class ModelLifecycleSnapshot(
    val state: String,
    val modelId: String?,
    val generating: Boolean,
)

internal class ModelLifecycle {
    private var loadedModelId: String? = null
    private var loadingModelId: String? = null
    private var activeRequestId: String? = null

    @Synchronized
    fun snapshot(): ModelLifecycleSnapshot = ModelLifecycleSnapshot(
        state = if (loadingModelId != null) "loading" else if (loadedModelId != null) "ready" else "unloaded",
        modelId = loadedModelId,
        generating = activeRequestId != null,
    )

    @Synchronized
    fun beginLoad(modelId: String): Boolean {
        check(activeRequestId == null) { "Generation is active" }
        check(loadingModelId == null) { "A model is already loading" }
        if (loadedModelId == modelId) return false
        loadingModelId = modelId
        return true
    }

    @Synchronized
    fun finishLoad(modelId: String) {
        check(loadingModelId == modelId) { "Unexpected model load completion" }
        loadedModelId = modelId
        loadingModelId = null
    }

    @Synchronized
    fun failLoad(modelId: String) {
        if (loadingModelId == modelId) loadingModelId = null
    }

    @Synchronized
    fun beginGeneration(requestId: String) {
        check(loadedModelId != null) { "Model is not loaded" }
        check(loadingModelId == null) { "A model is loading" }
        check(activeRequestId == null) { "Generation is already active" }
        activeRequestId = requestId
    }

    @Synchronized
    fun finishGeneration(requestId: String) {
        if (activeRequestId == requestId) activeRequestId = null
    }

    @Synchronized
    fun cancelGeneration() {
        activeRequestId = null
    }

    @Synchronized
    fun unload() {
        loadedModelId = null
        loadingModelId = null
        activeRequestId = null
    }
}
