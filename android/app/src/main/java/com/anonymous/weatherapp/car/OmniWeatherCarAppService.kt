package com.anonymous.weatherapp.car

import android.content.Intent
import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.SessionInfo
import androidx.car.app.model.Action
import androidx.car.app.model.Header
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.validation.HostValidator
import com.anonymous.weatherapp.BuildConfig

class OmniWeatherCarAppService : CarAppService() {
  override fun createHostValidator(): HostValidator {
    return if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    } else {
      HostValidator.Builder(this)
        .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
        .build()
    }
  }

  override fun onCreateSession(sessionInfo: SessionInfo): Session {
    return OmniWeatherCarSession()
  }
}

class OmniWeatherCarSession : Session() {
  override fun onCreateScreen(intent: Intent): Screen {
    return OmniWeatherCarScreen(carContext)
  }
}

class OmniWeatherCarScreen(carContext: CarContext) : Screen(carContext) {
  override fun onGetTemplate(): Template {
    val list = ItemList.Builder()
      .addItem(
        Row.Builder()
          .setTitle("Current weather")
          .addText("Use OMNIwx on your phone to choose the active place.")
          .build()
      )
      .addItem(
        Row.Builder()
          .setTitle("Radar")
          .addText("Radar, station products, and alerts remain available in the phone app.")
          .build()
      )
      .addItem(
        Row.Builder()
          .setTitle("Driving mode")
          .addText("This Android Auto surface uses car-safe templates only.")
          .build()
      )
      .build()

    val header = Header.Builder()
      .setTitle("OMNIwx Alpha ${BuildConfig.VERSION_NAME}")
      .setStartHeaderAction(Action.APP_ICON)
      .addEndHeaderAction(
        Action.Builder()
          .setTitle("Refresh")
          .setOnClickListener { invalidate() }
          .build()
      )
      .build()

    return ListTemplate.Builder()
      .setSingleList(list)
      .setHeader(header)
      .build()
  }
}
