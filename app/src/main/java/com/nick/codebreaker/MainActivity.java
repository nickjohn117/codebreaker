package com.nick.codebreaker;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/** Hosts the game, which is a single offline HTML page bundled in assets/www. */
public class MainActivity extends Activity {
    private WebView web;
    private FrameLayout root;

    /** Lets the game match the phone's status and navigation bars to its light/dark theme. */
    private class Bridge {
        @JavascriptInterface
        public void setTheme(String theme) { runOnUiThread(() -> applyBars("light".equals(theme))); }
    }

    private void applyBars(boolean light) {
        int bg = light ? Color.parseColor("#F2EEE5") : Color.parseColor("#060A11");
        root.setBackgroundColor(bg);
        web.setBackgroundColor(bg);
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        if (Build.VERSION.SDK_INT >= 30 && getWindow().getInsetsController() != null) {
            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(light ? mask : 0, mask);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#060A11"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#060A11"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // no text-selection popups when holding "My code"
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        web.setHapticFeedbackEnabled(false);
        web.setWebViewClient(new WebViewClient());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.addJavascriptInterface(new Bridge(), "Android");
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        // Android 15+ draws edge-to-edge: keep the game clear of the status bar, nav bar and cutout.
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }

        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // let the game close menus / go back a screen first; leave the app only from the home screen
        web.evaluateJavascript("window.cbBack ? window.cbBack() : false", result -> {
            if (!"true".equals(result)) finish();
        });
    }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
