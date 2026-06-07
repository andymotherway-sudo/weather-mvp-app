package com.anonymous.weatherapp.video

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// React Native only sees native modules that are registered through a package.
// MainApplication adds this package so JS can call NativeModules.OmniwxVideoExport.
class OmniwxVideoExportPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(OmniwxVideoExportModule(reactContext))
  }

  // This package exposes functions only; it does not mount any native UI views.
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
