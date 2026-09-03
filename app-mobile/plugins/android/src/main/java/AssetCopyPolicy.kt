package com.colton.omnathmodel

data class BundledAssetSpec(
    val kind: String,
    val assetPath: String,
    val databaseFile: String,
)

object AssetCopyPolicy {
    fun spec(kind: String?): BundledAssetSpec? = when (kind) {
        "knowledge" -> BundledAssetSpec(
            "knowledge",
            "knowledge/omnath-knowledge.sqlite",
            "omnath-knowledge.sqlite",
        )
        "art" -> BundledAssetSpec(
            "art",
            "art/omnath-art.sqlite",
            "omnath-art.sqlite",
        )
        else -> null
    }

    fun acceptsDestination(spec: BundledAssetSpec, name: String?): Boolean =
        name?.matches(Regex("${Regex.escape(spec.databaseFile)}\\.tmp-[0-9]+")) == true
}
