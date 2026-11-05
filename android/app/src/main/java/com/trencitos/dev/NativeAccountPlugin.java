package com.trencitos.dev;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NativeAccount")
public class NativeAccountPlugin extends Plugin {
    private PluginCall pending;
    private boolean leftBrowser;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable cancel = () -> finish(null);
    private SecretKey key() throws Exception {
        String alias = getContext().getPackageName() + ".account";
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(alias, null);
    }
    private String server(PluginCall call) {
        String value = call.getString("server", ""); Uri url = Uri.parse(value);
        if (!"https".equals(url.getScheme()) || url.getHost() == null || url.getUserInfo() != null) {
            call.reject("Servidor de cuenta inválido."); return null;
        }
        return value;
    }
    @PluginMethod public void getSession(PluginCall call) {
        String server = server(call); if (server == null) return;
        try {
            String value = getContext().getSharedPreferences("native_account", 0).getString(server, "");
            if (!value.isEmpty()) {
                String[] parts = value.split(":", 2); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                cipher.updateAAD(server.getBytes(StandardCharsets.UTF_8));
                value = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            }
            call.resolve(new JSObject().put("value", value));
        } catch (Exception e) {
            // A restored app backup cannot restore a device-bound Keystore key.
            // Drop that unusable account session; guest play and a fresh login remain available.
            getContext().getSharedPreferences("native_account", 0).edit().remove(server).commit();
            call.resolve(new JSObject().put("value", ""));
        }
    }
    @PluginMethod public void setSession(PluginCall call) {
        String server = server(call), value = call.getString("value");
        if (server == null) return;
        if (value == null || value.length() > 5000) { call.reject("Sesión inválida."); return; }
        try {
            var editor = getContext().getSharedPreferences("native_account", 0).edit();
            if (value.isEmpty()) editor.remove(server);
            else {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
                cipher.updateAAD(server.getBytes(StandardCharsets.UTF_8));
                editor.putString(server, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
            }
            if (!editor.commit()) throw new Exception();
            call.resolve();
        } catch (Exception e) { call.reject("No se pudo guardar la sesión de forma segura."); }
    }
    @PluginMethod public void authenticate(PluginCall call) {
        String server = server(call), value = call.getString("url", "");
        if (server == null) return;
        if (!value.startsWith(server + "/auth/native?") || !"/auth/native".equals(Uri.parse(value).getPath())) { call.reject("Acceso inválido."); return; }
        getActivity().runOnUiThread(() -> {
            if (pending != null) { call.reject("Ya hay un acceso en curso."); return; }
            pending = call; leftBrowser = false;
            try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(value))); handler.postDelayed(cancel, 600000); }
            catch (Exception e) { finish(null); }
        });
    }
    private void finish(Uri uri) {
        handler.removeCallbacks(cancel);
        PluginCall call = pending; pending = null; if (call == null) return;
        if (uri == null) call.reject("No se completó el acceso con Google. Puedes reintentarlo.");
        else call.resolve(new JSObject().put("url", uri.toString()));
    }
    @Override protected void handleOnNewIntent(Intent intent) {
        Uri uri = intent.getData();
        if (uri != null && "trencitos".equals(uri.getScheme()) && "auth".equals(uri.getHost())) finish(uri);
    }
    @Override protected void handleOnPause() { if (pending != null) leftBrowser = true; }
    @Override protected void handleOnResume() { if (pending != null && leftBrowser) handler.postDelayed(cancel, 500); }
    @Override protected void handleOnDestroy() { finish(null); }
}
