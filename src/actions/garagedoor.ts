import { DeviceAction } from './device'
import { Smartthings } from '../smartthings-plugin'

export class GarageDoorAction extends DeviceAction {
  constructor(plugin: Smartthings, actionName: string) {
    super(plugin, actionName)
  }
}
