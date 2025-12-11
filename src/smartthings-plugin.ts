import { SceneAction } from './actions/scene'
import { DeviceAction } from './actions/device'
import { StreamDeckPluginHandler } from 'streamdeck-typescript'

export class Smartthings extends StreamDeckPluginHandler {
    constructor() {
        super()
        new SceneAction(this, 'com.thibautsabot.streamdeck.scene')
        // Reuse DeviceAction for all device-based entries
        new DeviceAction(this, 'com.thibautsabot.streamdeck.device')
        new DeviceAction(this, 'com.thibautsabot.streamdeck.light')
        new DeviceAction(this, 'com.thibautsabot.streamdeck.switch')
        new DeviceAction(this, 'com.thibautsabot.streamdeck.garagedoor')
    }
}

new Smartthings()
