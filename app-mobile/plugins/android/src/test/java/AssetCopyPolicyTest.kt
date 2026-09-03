package com.colton.omnathmodel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AssetCopyPolicyTest {
    @Test
    fun acceptsOnlyCataloguedAssetsAndBoundedTemporaryNames() {
        val art = AssetCopyPolicy.spec("art")
        assertNotNull(art)
        assertTrue(AssetCopyPolicy.acceptsDestination(art!!, "omnath-art.sqlite.tmp-123"))
        assertFalse(AssetCopyPolicy.acceptsDestination(art, "../omnath-art.sqlite.tmp-123"))
        assertFalse(AssetCopyPolicy.acceptsDestination(art, "omnath-knowledge.sqlite.tmp-123"))
        assertNull(AssetCopyPolicy.spec("../../private"))
    }
}
