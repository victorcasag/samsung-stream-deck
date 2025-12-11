import { DeviceAction } from './device'
import { Smartthings } from '../smartthings-plugin'

export class LightAction extends DeviceAction {
  constructor(plugin: Smartthings, actionName: string) {
    super(plugin, actionName)
  }
}
