package com.colton.omnathmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelLifecycleTest {
    @Test
    fun loadTransitionsAndSameModelIsIdempotent() {
        val lifecycle = ModelLifecycle()
        assertEquals("unloaded", lifecycle.snapshot().state)
        assertTrue(lifecycle.beginLoad("base"))
        assertEquals("loading", lifecycle.snapshot().state)
        lifecycle.finishLoad("base")
        assertEquals("ready", lifecycle.snapshot().state)
        assertEquals("base", lifecycle.snapshot().modelId)
        assertFalse(lifecycle.beginLoad("base"))
    }

    @Test
    fun concurrentLoadAndGenerationFailClosed() {
        val lifecycle = ModelLifecycle()
        lifecycle.beginLoad("base")
        assertThrows(IllegalStateException::class.java) { lifecycle.beginLoad("enhanced") }
        lifecycle.finishLoad("base")
        lifecycle.beginGeneration("first")
        assertThrows(IllegalStateException::class.java) { lifecycle.beginGeneration("second") }
        assertThrows(IllegalStateException::class.java) { lifecycle.beginLoad("enhanced") }
    }

    @Test
    fun cancellationFailureAndUnloadRecover() {
        val lifecycle = ModelLifecycle()
        lifecycle.beginLoad("base")
        lifecycle.failLoad("base")
        assertEquals("unloaded", lifecycle.snapshot().state)
        lifecycle.beginLoad("enhanced")
        lifecycle.finishLoad("enhanced")
        lifecycle.beginGeneration("request")
        lifecycle.cancelGeneration()
        assertFalse(lifecycle.snapshot().generating)
        lifecycle.beginGeneration("next")
        lifecycle.finishGeneration("next")
        lifecycle.unload()
        assertEquals(ModelLifecycleSnapshot("unloaded", null, false), lifecycle.snapshot())
    }
}
