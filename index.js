let Service, Characteristic, Accessory, UUID
const Leviton = require('./api.js')
const PLUGIN_NAME = 'homebridge-leviton'
const PLATFORM_NAME = 'LevitonDecoraSmart'

class LevitonDecoraSmartPlatform {
  constructor(log, config, api) {
    this.log = log
    this.config = config
    this.api = api
    this.accessories = []

    if (config === null) {
      this.log.error('No config defined.')
      return
    }

    if (!config.email || !config.password) {
      this.log.error('email and password are required in config.json')
      return
    }

    api.on('didFinishLaunching', async () => {
      this.log('didFinishLaunching')
      const { devices, token } = await this.initialize(config)
      devices.forEach((device) => {
        if (
          !this.accessories.find(
            (acc) => acc.context.device.serial === device.serial
          )
        ) {
          this.addAccessory(device, token)
        }
      })
    })
  }

  async initialize(config) {
    this.log('initialize')
    const { id: token, userId: personID } = await Leviton.postPersonLogin({
      email: this.config['email'],
      password: this.config['password'],
    })
    const permissions = await Leviton.getPersonResidentialPermissions({
      personID,
      token,
    })
    const accountID = permissions[0].residentialAccountId
    const {
      primaryResidenceId: residenceID,
    } = await Leviton.getResidentialAccounts({
      accountID,
      token,
    })
    const devices = await Leviton.getResidenceIotSwitches({
      residenceID,
      token,
    })
    return { devices, token }
  }

  onGetPower(service, device, token) {
    return function (callback) {
      this.log('onGetPower', device.name)
      return Leviton.getIotSwitch({
        switchID: device.id,
        token,
      })
        .then((res) => {
          this.log('onGetPower callback', res.power)
          service
            .getCharacteristic(Characteristic.On)
            .updateValue(res.power === 'ON')
          callback(null, res.power === 'ON')
        })
        .catch((err) => {
          this.log('error', err)
        })
    }
  }

  onSetPower(service, device, token) {
    return function (value, callback) {
      this.log('onSetPower', device.name, value)
      return Leviton.putIotSwitch({
        switchID: device.id,
        power: value ? 'ON' : 'OFF',
        token,
      })
        .then((res) => {
          this.log('onSetPower callback', res.power)
          service
            .getCharacteristic(Characteristic.On)
            .updateValue(res.power === 'ON')
          callback()
        })
        .catch((err) => {
          this.log('error', err)
        })
    }
  }

  onGetBrightness(service, device, token) {
    return function (callback) {
      this.log('onGetBrightness', device.name)
      return Leviton.getIotSwitch({
        switchID: device.id,
        token,
      })
        .then((res) => {
          this.log('onGetBrightness callback', res.brightness)
          service
            .getCharacteristic(Characteristic.Brightness)
            .updateValue(res.brightness)
          callback(null, res.brightness)
        })
        .catch((err) => {
          this.log('error', err)
        })
    }
  }

  onSetBrightness(service, device, token) {
    return function (brightness, callback) {
      this.log('onSetBrightness', device.name, brightness)
      return Leviton.putIotSwitch({
        switchID: device.id,
        brightness,
        token,
      })
        .then((res) => {
          this.log('onSetBrightness callback', res.brightness)
          service
            .getCharacteristic(Characteristic.Brightness)
            .updateValue(res.brightness)
          callback()
        })
        .catch((err) => {
          this.log('error', err)
        })
    }
  }

  async addAccessory(device, token) {
    this.log(`addAccessory ${device.name}`)

    const uuid = UUID.generate(device.serial)
    const accessory = new this.api.platformAccessory(device.name, uuid)

    accessory.context.device = device
    accessory.context.token = token
    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.SerialNumber, device.serial)
      .setCharacteristic(Characteristic.Manufacturer, device.manufacturer)
      .setCharacteristic(Characteristic.Model, device.model)
      .setCharacteristic(Characteristic.FirmwareRevision, device.version)

    this.setupService(accessory)
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
      accessory,
    ])
    this.accessories.push(accessory)
    this.log(`Finished adding accessory ${device.name}`)
  }

  async configureAccessory(accessory) {
    this.log('configureAccessory', accessory.displayName)
    this.setupService(accessory)
    this.accessories.push(accessory)
  }

  async getStatus(device, token) {
    this.log('getStatus', device.name)
    return Leviton.getIotSwitch({
      switchID: device.id,
      token,
    })
  }

  async setupService(accessory) {
    this.log('setupService', accessory.displayName)
    const device = accessory.context.device
    const token = accessory.context.token
    const status = await this.getStatus(device, token)
    const service =
      accessory.getService(Service.Lightbulb, device.name) ||
      accessory.addService(Service.Lightbulb, device.name)

    service
      .getCharacteristic(Characteristic.On)
      .on('get', this.onGetPower(service, device, token).bind(this))
      .on('set', this.onSetPower(service, device, token).bind(this))
      .updateValue(status.power === 'ON' ? true : false)

    service
      .getCharacteristic(Characteristic.Brightness)
      .on('get', this.onGetBrightness(service, device, token).bind(this))
      .on('set', this.onSetBrightness(service, device, token).bind(this))
      .setProps({
        minValue: status.minLevel,
        maxValue: status.maxLevel,
        minStep: 1,
      })
      .updateValue(status.brightness)
  }

  removeAccessories() {
    this.log.info('Removing all accessories')
    this.api.unregisterPlatformAccessories(
      PLUGIN_NAME,
      PLATFORM_NAME,
      this.accessories
    )
    this.accessories.splice(0, this.accessories.length)
  }
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  Accessory = homebridge.hap.Accessory
  UUID = homebridge.hap.uuid
  homebridge.registerPlatform(
    PLUGIN_NAME,
    PLATFORM_NAME,
    LevitonDecoraSmartPlatform,
    true
  )
}