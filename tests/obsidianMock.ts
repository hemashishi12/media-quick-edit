import { vi } from "vitest";

export const requestUrl = vi.fn();
export class App {}
export class Component {
  app: any;
  constructor(app?: any) { this.app = app; }
  registerDomEvent(..._args: any[]) {}
}
export class Plugin extends Component {
  manifest: any;
  _data: any = {};
  settingTabs: any[] = [];
  basesViews: any[] = [];
  ribbons: any[] = [];
  constructor(app?: any, manifest: any = {}) { super(app); this.manifest = manifest; }
  async loadData() { return this._data; }
  async saveData(data: any) { this._data = data; }
  addSettingTab(tab: any) { this.settingTabs.push(tab); }
  registerBasesView(id: string, registration: any) { this.basesViews.push({ id, registration }); return true; }
  addRibbonIcon(icon: string, title: string, callback: () => void) { this.ribbons.push({ icon, title, callback }); }
}
export class TFile {
  path = "";
  extension = "";
  basename = "";
  stat = { mtime: 0 };
}
export class Modal extends Component {
  titleEl: any;
  contentEl: any;
  open() {}
  close() {}
}
export class BasesView extends Component {
  config: any;
  data: any;
  constructor(controller?: any) { super(controller?.app); }
}
export const Keymap = { isModEvent: () => false };
export class Notice {
  static messages: string[] = [];
  constructor(message: string) { Notice.messages.push(message); }
}
export class FuzzySuggestModal<T> {
  constructor(..._args: any[]) {}
  setPlaceholder(..._args: any[]) { return this; }
  open() {}
}
export class PluginSettingTab {
  app: any;
  containerEl: any;
  constructor(app?: any, ..._args: any[]) { this.app = app; }
}
export class Setting {
  constructor(..._args: any[]) {}
}
