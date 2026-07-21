package com.qwixl.atom;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

/**
 * Enable WebAuthn / passkeys inside the Capacitor WebView (Android Credential Manager).
 * Requires Digital Asset Links at https://atom.qwixl.com/.well-known/assetlinks.json.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableWebAuthnInWebView();
    }

    @Override
    public void onStart() {
        super.onStart();
        // Bridge WebView may finish init after onCreate on some devices.
        enableWebAuthnInWebView();
    }

    private void enableWebAuthnInWebView() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) return;
        WebSettingsCompat.setWebAuthenticationSupport(
            webView.getSettings(),
            WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
        );
    }
}
