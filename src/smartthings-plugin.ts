import { SceneAction } from './actions/scene'
import { DeviceAction } from './actions/device'
import { LightAction } from './actions/light'
import { SwitchAction } from './actions/switch'
import { GarageDoorAction } from './actions/garagedoor'
import { AirConditionerAction } from './actions/airconditioner'
import { StreamDeckPluginHandler } from 'streamdeck-typescript'

export class Smartthings extends StreamDeckPluginHandler {
  constructor() {
    super()
    new SceneAction(this, 'com.thibautsabot.streamdeck.scene')
    new DeviceAction(this, 'com.thibautsabot.streamdeck.device')
    new LightAction(this, 'com.thibautsabot.streamdeck.light')
    new SwitchAction(this, 'com.thibautsabot.streamdeck.switch')
    new GarageDoorAction(this, 'com.thibautsabot.streamdeck.garagedoor')

    // Air Conditioner Actions
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_power')
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_mode')
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_temp_up')
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_temp_down')
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_fan_mode')
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_swing_vertical')
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_swing_horizontal')
    new AirConditionerAction(this, 'com.thibautsabot.streamdeck.ac_windfree')
  }
}

new Smartthings()
