package live.archmage.usb

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbConfiguration
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.hardware.usb.UsbRequest
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.annotation.RequiresApi
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.util.UUID

@JvmRecord
data class ControlTransferArgs(
  val requestType: Int,
  val request: Int,
  val value: Int,
  val index: Int,
  val buffer: ByteArray,
  val offset: Int? = null,
  val length: Int,
  val timeout: Int,
)

@JvmRecord
data class BulkTransferArgs(
  val endpointAddress: Int,
  val buffer: ByteArray,
  val offset: Int? = null,
  val length: Int,
  val timeout: Int,
)

const val DEVICE_CONNECT_EVENT_NAME = "onDeviceConnect"
const val DEVICE_DISCONNECT_EVENT_NAME = "onDeviceDisconnect"
const val ACCESSORY_CONNECT_EVENT_NAME = "onAccessoryConnect"
const val ACCESSORY_DISCONNECT_EVENT_NAME = "onAccessoryDisconnect"

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

    Events(
      DEVICE_CONNECT_EVENT_NAME,
      DEVICE_DISCONNECT_EVENT_NAME,
      ACCESSORY_CONNECT_EVENT_NAME,
      ACCESSORY_DISCONNECT_EVENT_NAME,
    )

    Function("getDeviceList") {
      usbManager.deviceList.mapValues { formatDevice(it.value) }
    }

    Function("getAccessoryList") {
      usbManager.accessoryList.map { formatAccessory(it) }
    }

    Function("hasDevicePermission") { deviceName: String ->
      val device = usbManager.deviceList[deviceName] ?: return@Function false
      usbManager.hasPermission(device)
    }

    Function("hasAccessoryPermission") { accessoryHashCode: Int ->
      usbManager.accessoryList.find { it.hashCode() == accessoryHashCode }
        ?.let { usbManager.hasPermission(it) }
        ?: false
    }

    AsyncFunction("requestDevicePermission") { deviceName: String, promise: Promise ->
      val device = usbManager.deviceList[deviceName]
      if (device == null) {
        promise.reject(CodedException("Device not found"))
        return@AsyncFunction
      }

      if (requestPermissionPromise != null) {
        promise.reject(CodedException("Another permission request is in progress"))
        return@AsyncFunction
      }
      requestPermissionPromise = promise

      val pi = PendingIntent.getBroadcast(
        context, 0,
        Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_IMMUTABLE
      )
      usbManager.requestPermission(device, pi)
    }

    AsyncFunction("requestAccessoryPermission") { accessoryHashCode: Int, promise: Promise ->
      val accessory = usbManager.accessoryList.find { it.hashCode() == accessoryHashCode }
      if (accessory == null) {
        promise.reject(CodedException("Accessory not found"))
        return@AsyncFunction
      }

      if (requestPermissionPromise != null) {
        promise.reject(CodedException("Another permission request is in progress"))
        return@AsyncFunction
      }
      requestPermissionPromise = promise

      val pi = PendingIntent.getBroadcast(
        context, 0,
        Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_IMMUTABLE
      )
      usbManager.requestPermission(accessory, pi)
    }

    Function("openDevice") { deviceName: String ->
      val device = usbManager.deviceList[deviceName] ?: return@Function null
      val conn = usbManager.openDevice(device)
      if (conn != null) {
        val uuid = UUID.randomUUID().toString()
        deviceConnections[uuid] = conn to device
        uuid
      } else {
        null
      }
    }

    Function("closeDevice") { connUuid: String ->
      closeDevice(connUuid)
    }

    Function("claimInterface") { connUuid: String, interfaceId: Int, alternateSetting: Int, force: Boolean ->
      val pair = deviceConnections[connUuid] ?: return@Function false
      val inf = (0..<pair.second.interfaceCount).map { pair.second.getInterface(it) }
        .find { it.id == interfaceId && it.alternateSetting == alternateSetting }
        ?: return@Function false
      pair.first.claimInterface(inf, force)
    }

    Function("releaseInterface") { connUuid: String, interfaceId: Int, alternateSetting: Int ->
      val pair = deviceConnections[connUuid] ?: return@Function false
      val inf = (0..<pair.second.interfaceCount).map { pair.second.getInterface(it) }
        .find { it.id == interfaceId && it.alternateSetting == alternateSetting }
        ?: return@Function false
      pair.first.releaseInterface(inf)
    }

    Function("setInterface") { connUuid: String, interfaceId: Int, alternateSetting: Int ->
      val pair = deviceConnections[connUuid] ?: return@Function false
      val inf = (0..<pair.second.interfaceCount).map { pair.second.getInterface(it) }
        .find { it.id == interfaceId && it.alternateSetting == alternateSetting }
        ?: return@Function false
      pair.first.setInterface(inf)
    }

    Function("setConfiguration") { connUuid: String, configurationId: Int ->
      val pair = deviceConnections[connUuid] ?: return@Function false
      val conf = (0..<pair.second.configurationCount).map { pair.second.getConfiguration(it) }
        .find { it.id == configurationId } ?: return@Function false
      pair.first.setConfiguration(conf)
    }

    Function("controlTransfer") { connUuid: String, args: ControlTransferArgs ->
      val pair = deviceConnections[connUuid] ?: return@Function -1
      pair.first.controlTransfer(
        args.requestType,
        args.request,
        args.value,
        args.index,
        args.buffer,
        args.offset ?: 0,
        args.length,
        args.timeout
      )
    }

    Function("bulkTransfer") { connUuid: String, args: BulkTransferArgs ->
      val pair = deviceConnections[connUuid] ?: return@Function -1
      val endpoint = (0..<pair.second.interfaceCount).map { pair.second.getInterface(it) }
        .flatMap { inf ->
          (0..<inf.endpointCount).map { inf.getEndpoint(it) }
        }
        .find { it.address == args.endpointAddress } ?: return@Function -1
      pair.first.bulkTransfer(endpoint, args.buffer, args.offset ?: 0, args.length, args.timeout)
    }

    Function("createRequest") { connUuid: String, endpointAddress: Int ->
      val pair =
        deviceConnections[connUuid] ?: throw CodedException("UsbDeviceConnection not found")
      val endpoint = (0..<pair.second.interfaceCount).map { pair.second.getInterface(it) }
        .flatMap { inf ->
          (0..<inf.endpointCount).map { inf.getEndpoint(it) }
        }
        .find { it.address == endpointAddress } ?: throw CodedException("UsbEndpoint not found")

      val uuid = UUID.randomUUID().toString()
      val request = UsbRequest()
      request.clientData = uuid
      if (!request.initialize(pair.first, endpoint)) {
        throw CodedException("UsbRequest initialize failed")
      }
      requests[uuid] = request to pair.first
      uuid
    }

    Function("destroyRequest") { requestUuid: String ->
      destroyRequest(requestUuid)
    }

    Function("cancelRequest") { requestUuid: String ->
      val pair = requests[requestUuid] ?: return@Function false
      pair.first.cancel()
      return@Function true
    }

    AsyncFunction("writeRequest") { requestUuid: String, data: ByteArray, promise: Promise ->
      val pair = requests[requestUuid]
      if (pair == null) {
        promise.reject(CodedException("UsbRequest not found"))
        return@AsyncFunction
      }
      if (queuePromises.contains(requestUuid)) {
        promise.reject(CodedException("UsbRequest already queued"))
        return@AsyncFunction
      }

      @Suppress("NewApi")
      if (!pair.first.queue(ByteBuffer.wrap(data))) {
        destroyRequest(requestUuid)
        promise.reject(CodedException("UsbRequest queue failed"))
        return@AsyncFunction
      }
      queuePromises[requestUuid] = promise to null

      requestWait(pair.second)
    }

    AsyncFunction("readRequest") { requestUuid: String, maxLength: Int, promise: Promise ->
      val pair = requests[requestUuid]
      if (pair == null) {
        promise.reject(CodedException("UsbRequest not found"))
        return@AsyncFunction
      }
      if (queuePromises.contains(requestUuid)) {
        promise.reject(CodedException("UsbRequest already queued"))
        return@AsyncFunction
      }

      val buffer = ByteBuffer.allocate(maxLength)
      @Suppress("NewApi")
      if (!pair.first.queue(buffer)) {
        destroyRequest(requestUuid)
        promise.reject(CodedException("UsbRequest queue failed"))
        return@AsyncFunction
      }
      queuePromises[requestUuid] = promise to buffer

      requestWait(pair.second)
    }

    Function("openAccessory") { accessoryHashCode: Int ->
      val accessory = usbManager.accessoryList.find { it.hashCode() == accessoryHashCode }
        ?: return@Function false
      val fileDescriptor = usbManager.openAccessory(accessory) ?: return@Function false
      fileDescriptor.close()
      val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
      val outputStream = FileOutputStream(fileDescriptor.fileDescriptor)
      accessoryFileDescriptors[accessoryHashCode] =
        Triple(fileDescriptor, inputStream, outputStream) to accessory
      return@Function true
    }

    Function("closeAccessory") { accessoryHashCode: Int ->
      closeAccessory(accessoryHashCode)
    }

    AsyncFunction("writeAccessory") { accessoryHashCode: Int, data: ByteArray, promise: Promise ->
      val pair = accessoryFileDescriptors[accessoryHashCode]
      if (pair == null) {
        promise.reject(CodedException("UsbAccessory not found"))
        return@AsyncFunction
      }
      pair.first.third.write(data)
      pair.first.third.flush()
      promise.resolve()
    }

    AsyncFunction("readAccessory") { accessoryHashCode: Int, maxLength: Int, promise: Promise ->
      val pair = accessoryFileDescriptors[accessoryHashCode]
      if (pair == null) {
        promise.reject(CodedException("UsbAccessory not found"))
        return@AsyncFunction
      }
      val buffer = ByteArray(maxLength)
      val length = pair.first.second.read(buffer)
      if (length < 0) {
        promise.reject(CodedException("UsbAccessory read failed"))
        return@AsyncFunction
      }
      promise.resolve(buffer.sliceArray(0 until length))
    }

    OnCreate {
      val filter = IntentFilter()
      filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
      filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
      filter.addAction(UsbManager.ACTION_USB_ACCESSORY_ATTACHED)
      filter.addAction(UsbManager.ACTION_USB_ACCESSORY_DETACHED)
      filter.addAction(ACTION_USB_PERMISSION)

      @Suppress("NewApi")
      context.registerReceiver(broadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    }

    OnDestroy {
      context.unregisterReceiver(broadcastReceiver)
    }
  }

  private fun closeAccessory(accessoryHashCode: Int): Boolean {
    val pair = accessoryFileDescriptors.remove(accessoryHashCode) ?: return false
    pair.first.first.close()
    pair.first.second.close()
    pair.first.third.close()
    return true
  }

  private fun closeDevice(connUuid: String): Boolean {
    val pair = deviceConnections.remove(connUuid) ?: return false
    pair.first.close()
    return true
  }

  private fun closeDevice(device: UsbDevice) {
    val deviceConnections = deviceConnections.filter { it.value.second == device }
    for ((connUuid, pair) in deviceConnections) {
      closeDevice(connUuid)

      val conn = pair.first
      requests.filter { it.value.second == conn }.forEach {
        val requestUuid = it.key
        destroyRequest(requestUuid)

        val promise = queuePromises.remove(requestUuid)?.first
        promise?.reject(CodedException("UsbDeviceConnection closed"))
      }
    }
  }

  private fun destroyRequest(requestUuid: String): Boolean {
    val pair = requests.remove(requestUuid) ?: return false
    pair.first.close()
    return true
  }

  private fun requestWait(conn: UsbDeviceConnection) {
    val request = conn.requestWait() // TODO: timeout & error handling
    val uuid = request.clientData as String
    val pair = queuePromises.remove(uuid) ?: return
    val promise = pair.first
    val buffer = pair.second
    if (buffer == null) {
      // for write
      promise.resolve()
    } else {
      // for read
      buffer.rewind()
      val data = ByteArray(buffer.remaining())
      buffer.get(data)
      promise.resolve(data)
    }
  }

  fun formatDevice(device: UsbDevice): Map<String, Any> {
    val configurations =
      (0..<device.configurationCount).map { formatConfiguration(device.getConfiguration(it)) }

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
      "configurations" to configurations,
    )
  }

  private fun formatConfiguration(conf: UsbConfiguration): Map<String, Any> {
    val interfaces = (0..<conf.interfaceCount).map { formatInterface(conf.getInterface(it)) }

    return mapOf(
      "id" to conf.id,
      "name" to (conf.name ?: ""),
      "isSelfPowered" to conf.isSelfPowered,
      "isRemoteWakeup" to conf.isRemoteWakeup,
      "maxPower" to conf.maxPower,
      "interfaces" to interfaces,
    )
  }

  private fun formatInterface(inf: UsbInterface): Map<String, Any> {
    val endpoints = (0..<inf.endpointCount).map { formatEndpoint(inf.getEndpoint(it)) }

    return mapOf(
      "id" to inf.id,
      "alternateSetting" to inf.alternateSetting,
      "name" to (inf.name ?: ""),
      "interfaceClass" to inf.interfaceClass,
      "interfaceSubclass" to inf.interfaceSubclass,
      "interfaceProtocol" to inf.interfaceProtocol,
      "endpoints" to endpoints,
    )
  }

  private fun formatEndpoint(endpoint: UsbEndpoint): Map<String, Any> {
    return mapOf(
      "address" to endpoint.address,
      "endpointNumber" to endpoint.endpointNumber,
      "direction" to endpoint.direction,
      "attributes" to endpoint.attributes,
      "type" to endpoint.type,
      "maxPacketSize" to endpoint.maxPacketSize,
      "interval" to endpoint.interval,
    )
  }

  fun formatAccessory(accessory: UsbAccessory): Map<String, Any> {
    return mapOf(
      "hashCode" to accessory.hashCode(),
      "manufacturer" to accessory.manufacturer,
      "model" to accessory.model,
      "description" to (accessory.description ?: ""),
      "version" to (accessory.version ?: ""),
      "uri" to (accessory.uri ?: ""),
      "serial" to (accessory.serial ?: ""),
    )
  }

  private lateinit var context: Context

  private lateinit var usbManager: UsbManager

  private var requestPermissionPromise: Promise? = null

  private var deviceConnections = HashMap<String, Pair<UsbDeviceConnection, UsbDevice>>()
  private var requests = HashMap<String, Pair<UsbRequest, UsbDeviceConnection>>()
  private var queuePromises = HashMap<String, Pair<Promise, ByteBuffer?>>()

  private var accessoryFileDescriptors =
    HashMap<Int, Pair<Triple<ParcelFileDescriptor, FileInputStream, FileOutputStream>, UsbAccessory>>()

  private val broadcastReceiver = object : BroadcastReceiver() {
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    override fun onReceive(context: Context, intent: Intent) {
      synchronized(this) {
        val device =
          intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        val accessory =
          intent.getParcelableExtra(UsbManager.EXTRA_ACCESSORY, UsbAccessory::class.java)
        val target =
          if (device != null) formatDevice(device) else formatAccessory(accessory ?: return)

        when (intent.action) {
          UsbManager.ACTION_USB_DEVICE_ATTACHED, UsbManager.ACTION_USB_DEVICE_DETACHED -> {
            device ?: return
            val event =
              if (intent.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) {
                DEVICE_CONNECT_EVENT_NAME
              } else {
                closeDevice(device)
                DEVICE_DISCONNECT_EVENT_NAME
              }
            sendEvent(event, target)
          }

          UsbManager.ACTION_USB_ACCESSORY_ATTACHED, UsbManager.ACTION_USB_ACCESSORY_DETACHED -> {
            accessory ?: return
            val event =
              if (intent.action == UsbManager.ACTION_USB_ACCESSORY_ATTACHED) {
                ACCESSORY_CONNECT_EVENT_NAME
              } else {
                closeAccessory(accessory.hashCode())
                ACCESSORY_DISCONNECT_EVENT_NAME
              }
            sendEvent(event, target)
          }

          ACTION_USB_PERMISSION -> {
            if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
              requestPermissionPromise?.resolve(target)
            } else if (device != null) {
              requestPermissionPromise?.reject(CodedException("Permission denied for device $device"))
            } else {
              requestPermissionPromise?.reject(CodedException("Permission denied for accessory $accessory"))
            }
            requestPermissionPromise = null
          }
        }
      }
    }
  }
}
