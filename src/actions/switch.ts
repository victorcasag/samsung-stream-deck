import { DeviceAction } from './device'
import { Smartthings } from '../smartthings-plugin'

export class SwitchAction extends DeviceAction {
  constructor(plugin: Smartthings, actionName: string) {
    super(plugin, actionName)
  }
}
