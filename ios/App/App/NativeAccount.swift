import AuthenticationServices
import Capacitor
import Security
import UIKit

@objc(NativeAccountPlugin)
public class NativeAccountPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "NativeAccountPlugin"
    public let jsName = "NativeAccount"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]
    private var authentication: ASWebAuthenticationSession?

    private func query(_ call: CAPPluginCall) -> [String: Any]? {
        guard let server = call.getString("server"), let url = URL(string: server),
              url.scheme == "https", url.host != nil, url.user == nil, url.password == nil else {
            call.reject("Servidor de cuenta inválido."); return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "Trencitos") + ".account",
                kSecAttrAccount as String: server]
    }
    @objc func getSession(_ call: CAPPluginCall) {
        guard var item = query(call) else { return }
        item[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(item as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": ""]); return }
        guard status == errSecSuccess, let data = result as? Data else {
            call.reject("Desbloquea el iPhone para acceder a tu cuenta."); return
        }
        call.resolve(["value": String(data: data, encoding: .utf8) ?? ""])
    }
    @objc func setSession(_ call: CAPPluginCall) {
        guard let item = query(call) else { return }
        guard let value = call.getString("value"), value.count <= 5000 else { call.reject("Sesión inválida."); return }
        if value.isEmpty {
            let status = SecItemDelete(item as CFDictionary)
            if status != errSecSuccess && status != errSecItemNotFound { call.reject("No se pudo cerrar la sesión."); return }
        } else {
            let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
            var status = SecItemUpdate(item as CFDictionary, attributes as CFDictionary)
            if status == errSecItemNotFound { status = SecItemAdd(item.merging(attributes) { _, new in new } as CFDictionary, nil) }
            guard status == errSecSuccess else { call.reject("No se pudo guardar la sesión de forma segura."); return }
        }
        call.resolve()
    }
    @objc func authenticate(_ call: CAPPluginCall) {
        guard query(call) != nil, let server = call.getString("server"),
              let value = call.getString("url"), let url = URL(string: value),
              value.hasPrefix(server + "/auth/native?"), url.path == "/auth/native" else {
            call.reject("Acceso inválido."); return
        }
        DispatchQueue.main.async {
            guard self.authentication == nil else { call.reject("Ya hay un acceso en curso."); return }
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "trencitos") { returned, _ in
                self.authentication = nil
                guard let returned = returned, returned.scheme == "trencitos", returned.host == "auth" else {
                    call.reject("No se completó el acceso con Google. Puedes reintentarlo."); return
                }
                call.resolve(["url": returned.absoluteString])
            }
            session.presentationContextProvider = self
            self.authentication = session
            if !session.start() { self.authentication = nil; call.reject("No se pudo abrir Google.") }
        }
    }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

class TrencitosViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAccountPlugin())
        // Map cameras consume pointer events themselves; the document must not
        // acquire a second, independent WKWebView zoom that hides its controls.
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
    }
}
