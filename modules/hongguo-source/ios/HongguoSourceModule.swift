// Adapted from OpenHongguo's Apache-2.0 Expo binding; see ../README.md.
import ExpoModulesCore
import Foundation
import HongguoCore

public class HongguoSourceModule: Module {
  private let lock = NSLock()
  private var clients: [Int: CoreClient] = [:]
  private var nextId = 0

  public func definition() -> ModuleDefinition {
    Name("HongguoSource")

    Function("defaultProfilePath") { () throws -> String in
      var directory = try FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask,
        appropriateFor: nil, create: true
      ).appendingPathComponent("hongguo-source", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try directory.setResourceValues(values)
      return directory.appendingPathComponent("anonymous.json").path
    }

    Function("createClient") { (profilePath: String) -> String in
      var error: NSError?
      guard let client = CoreNewClient(profilePath, &error) else {
        return "{\"error\":{\"code\":\"INVALID_OPTIONS\",\"message\":\"Cannot initialize Hongguo source\"}}"
      }
      self.lock.lock()
      self.nextId += 1
      let id = self.nextId
      self.clients[id] = client
      self.lock.unlock()
      return "{\"result\":{\"id\":\(id)}}"
    }

    Function("releaseClient") { (id: Int) in
      self.lock.lock()
      let client = self.clients.removeValue(forKey: id)
      self.lock.unlock()
      client?.close()
    }

    AsyncFunction("call") { (id: Int, method: String, argsJson: String, promise: Promise) in
      self.lock.lock()
      let client = self.clients[id]
      self.lock.unlock()
      guard let client else {
        promise.resolve("{\"error\":{\"code\":\"INVALID_OPTIONS\",\"message\":\"Client was released\"}}")
        return
      }
      client.start(method, argsJSON: argsJson, callback: ResultCallback { promise.resolve($0) })
    }

    Function("cancelPlayback") { (id: Int) in
      self.lock.lock()
      let client = self.clients[id]
      self.lock.unlock()
      client?.cancelPlayback()
    }

    OnDestroy {
      self.lock.lock()
      let active = Array(self.clients.values)
      self.clients.removeAll()
      self.lock.unlock()
      active.forEach { $0.close() }
    }
  }
}

private final class ResultCallback: NSObject, CoreCallbackProtocol {
  private let handler: (String) -> Void
  init(_ handler: @escaping (String) -> Void) { self.handler = handler }
  func done(_ resultJSON: String?) { handler(resultJSON ?? "") }
}
