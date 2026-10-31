// Adapted from OpenHongguo's Apache-2.0 Expo binding; see ../../../README.md.
package dev.diance.hongguo

import dev.diance.hongguo.core.Core
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class HongguoSourceModule : Module() {
  private val clients = ConcurrentHashMap<Int, dev.diance.hongguo.core.Client>()
  private val nextId = AtomicInteger()

  override fun definition() = ModuleDefinition {
    Name("HongguoSource")

    Function("defaultProfilePath") {
      val context = appContext.reactContext ?: throw IllegalStateException("No React context")
      File(context.noBackupFilesDir, "hongguo-source/anonymous.json").path
    }

    Function("createClient") { profilePath: String ->
      try {
        val id = nextId.incrementAndGet()
        clients[id] = Core.newClient(profilePath)
        """{"result":{"id":$id}}"""
      } catch (_: Exception) {
        """{"error":{"code":"INVALID_OPTIONS","message":"Cannot initialize Hongguo source"}}"""
      }
    }

    Function("releaseClient") { id: Int ->
      clients.remove(id)?.close()
      Unit
    }

    Function("cancelPlayback") { id: Int ->
      clients[id]?.cancelPlayback()
      Unit
    }

    AsyncFunction("call") { id: Int, method: String, argsJson: String, promise: Promise ->
      val client = clients[id]
      if (client == null) {
        promise.resolve("""{"error":{"code":"INVALID_OPTIONS","message":"Client was released"}}""")
      } else {
        client.start(method, argsJson) { promise.resolve(it) }
      }
    }

    OnDestroy {
      clients.values.forEach { it.close() }
      clients.clear()
    }
  }
}
