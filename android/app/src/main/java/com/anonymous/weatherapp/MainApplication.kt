package com.anonymous.weatherapp

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.anonymous.weatherapp.video.OmniwxVideoExportPackage
import com.anonymous.weatherapp.widget.OmniwxWidgetRefreshReceiver
import com.anonymous.weatherapp.widget.OmniwxWidgetScheduler

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

/*
 * Native application bootstrap.
 *
 * This is where Android starts the React Native runtime and where we register
 * any native modules that Expo autolinking cannot discover by itself. Most of
 * the app is TypeScript, but native features like MP4 export need to be exposed
 * to JavaScript through a ReactPackage here.
 */
class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Manual package registration. The video exporter is custom
              // Kotlin code, so React Native will not know about it unless we
              // add its package to the generated package list.
              add(OmniwxVideoExportPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    // React Native has several release levels. If Gradle supplies an unknown
    // value, fall back to STABLE so a bad build flag cannot prevent startup.
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    // Allows Expo modules to receive Application.onCreate lifecycle events.
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    if (OmniwxWidgetRefreshReceiver.hasInstalledWidgets(this)) {
      OmniwxWidgetScheduler.schedule(this)
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // Forward orientation/theme/font-scale/etc. changes into Expo modules.
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
