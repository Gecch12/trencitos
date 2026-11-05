package com.trencitos.dev;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeAccountPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
