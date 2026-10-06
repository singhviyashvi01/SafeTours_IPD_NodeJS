package expo.modules.safetourssms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Sends ONE text message directly (no composer) with android.telephony.SmsManager and reports what the radio
 * said. Every part of the message gets a "sent" PendingIntent; the promise resolves only when all parts have
 * reported (or after 30 s), with { ok, error }. It never claims success on its own: ok is true only when every
 * part came back RESULT_OK.
 *
 * Needs the SEND_SMS permission (requested from JS with PermissionsAndroid). Google Play restricts this
 * permission: see the notes in the phase 6B report.
 */
class SafeToursSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SafeToursSms")

    AsyncFunction("isAvailableAsync") {
      return@AsyncFunction context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    AsyncFunction("hasPermissionAsync") {
      return@AsyncFunction ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("sendTextAsync") { phone: String, message: String, promise: Promise ->
      sendText(phone, message, promise)
    }
  }

  private fun smsManager(): SmsManager {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    }
  }

  private fun describe(resultCode: Int): String = when (resultCode) {
    SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "generic_failure"
    SmsManager.RESULT_ERROR_RADIO_OFF -> "radio_off"
    SmsManager.RESULT_ERROR_NULL_PDU -> "null_pdu"
    4 -> "no_service" // SmsManager.RESULT_ERROR_NO_SERVICE
    5 -> "limit_exceeded" // RESULT_ERROR_LIMIT_EXCEEDED
    else -> "error_$resultCode"
  }

  private fun sendText(phone: String, message: String, promise: Promise) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
      promise.resolve(mapOf("ok" to false, "error" to "no_permission"))
      return
    }

    val done = AtomicBoolean(false)
    val finish = { ok: Boolean, error: String? ->
      if (done.compareAndSet(false, true)) promise.resolve(mapOf("ok" to ok, "error" to error))
    }

    try {
      val manager = smsManager()
      val parts = manager.divideMessage(message)
      val action = "expo.modules.safetourssms.SENT." + UUID.randomUUID()
      val remaining = AtomicInteger(parts.size)
      val failure = arrayOfNulls<String>(1)
      val handler = Handler(Looper.getMainLooper())

      lateinit var receiver: BroadcastReceiver
      val cleanup = {
        try {
          context.unregisterReceiver(receiver)
        } catch (e: Exception) {
          // already unregistered
        }
      }
      receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          if (resultCode != Activity.RESULT_OK && failure[0] == null) failure[0] = describe(resultCode)
          if (remaining.decrementAndGet() == 0) {
            cleanup()
            finish(failure[0] == null, failure[0])
          }
        }
      }

      val filter = IntentFilter(action)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        context.registerReceiver(receiver, filter)
      }

      // The radio can take a while without signal: stop waiting (and say so) after 30 s.
      handler.postDelayed({
        if (!done.get()) {
          cleanup()
          finish(false, "timeout")
        }
      }, 30000)

      val sentIntents = ArrayList<PendingIntent>()
      for (i in 0 until parts.size) {
        val intent = Intent(action).setPackage(context.packageName)
        sentIntents.add(
          PendingIntent.getBroadcast(context, i, intent, PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE)
        )
      }

      if (parts.size == 1) {
        manager.sendTextMessage(phone, null, message, sentIntents[0], null)
      } else {
        manager.sendMultipartTextMessage(phone, null, parts, sentIntents, null)
      }
    } catch (e: SecurityException) {
      finish(false, "security_exception")
    } catch (e: Exception) {
      finish(false, e.javaClass.simpleName + ": " + (e.message ?: "send failed"))
    }
  }
}
