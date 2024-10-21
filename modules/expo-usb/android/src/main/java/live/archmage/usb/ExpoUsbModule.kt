package live.archmage.usb

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

const val DEVICE_CONNECT_EVENT_NAME = "onDeviceConnect"
const val DEVICE_DISCONNECT_EVENT_NAME = "onDeviceDisconnect"

const val ACTION_USB_PERMISSION = "live.archmage.usb.USB_PERMISSION"

class ExpoUsbModule : Module() {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('ExpoUsb')` in JavaScript.
    Name("ExpoUsb")

    // Sets constant properties on the module. Can take a dictionary or a closure that returns a dictionary.
    Constants(
      "PI" to Math.PI
    )

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { value: String ->
      // Send an event to JavaScript.
      sendEvent(
        "onChange", mapOf(
          "value" to value
        )
      )
    }

    OnCreate {
      val filter = IntentFilter()
      filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
      filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
      filter.addAction(ACTION_USB_PERMISSION)

      @Suppress("NewApi")
      context.registerReceiver(broadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    }

    OnDestroy {
      context.unregisterReceiver(broadcastReceiver)
    }
  }

  fun formatDevice(device: UsbDevice): Map<String, Any> {
    return mapOf(
      "deviceName" to device.deviceName,
      "manufacturerName" to (device.manufacturerName ?: ""),
      "productName" to (device.productName ?: ""),
      "version" to device.version,
      "serialNumber" to (device.serialNumber ?: ""),
      "deviceId" to device.deviceId,
      "vendorId" to device.vendorId,
      "productId" to device.productId,
      "deviceClass" to device.deviceClass,
      "deviceSubclass" to device.deviceSubclass,
      "deviceProtocol" to device.deviceProtocol,
    )
  }

  fun requestPermission() {
    usbManager.requestPermission()
  }

  private lateinit var context: Context

  private lateinit var usbManager: UsbManager

  private var requestPermissionPromise: Promise? = null

  private val broadcastReceiver = object : BroadcastReceiver() {
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    override fun onReceive(context: Context, intent: Intent) {
      val device =
        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java) ?: return

      when (intent.action) {
        UsbManager.ACTION_USB_DEVICE_ATTACHED, UsbManager.ACTION_USB_DEVICE_DETACHED -> {
          val event =
            if (intent.action == UsbManager.ACTION_USB_DEVICE_ATTACHED)
              DEVICE_CONNECT_EVENT_NAME
            else
              DEVICE_DISCONNECT_EVENT_NAME
          sendEvent(event, formatDevice(device))
        }
        ACTION_USB_PERMISSION -> {
          if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
          } else {
            requestPermissionPromise?.reject(CodedException("Permission denied for device $device"))
          }
          requestPermissionPromise = null
        }
      }
    }
  }
}
