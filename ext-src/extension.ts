import * as path from 'path';
import * as vscode from 'vscode';

import Browser from './browser'
import BrowserPage from './browserPage';
import TargetTreeProvider from './targetTreeProvider';
import * as EventEmitter from 'eventemitter2';

export function activate(context: vscode.ExtensionContext) {

	const windowManager = new BrowserViewWindowManager();
	const nodeDependenciesProvider = new TargetTreeProvider();
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);

	context.subscriptions.push(vscode.commands.registerCommand('browserview.showInstance', () => {
		windowManager.create(context.extensionPath);
	}));
}

class BrowserViewWindowManager {

	private openWindows: Set<BrowserViewWindow>;
	private browser: any;

	constructor() {
		this.openWindows = new Set();
	}
	
	public create(extensionPath: string) {

		if(!this.browser) {
			this.browser = new Browser();
		}

		let window = new BrowserViewWindow(extensionPath, this.browser);
		window.initialize();
		window.once('disposed', () => {
			this.openWindows.delete(window);

			if(this.openWindows.size === 0) {
				this.browser.dispose();
				this.browser = null;
			}
		});
		this.openWindows.add(window);
	}

}

class BrowserViewWindow extends EventEmitter.EventEmitter2 {

	private static readonly viewType = 'browserview';

	private _panel: vscode.WebviewPanel | null;
	private _extensionPath: string;
	private _disposables: vscode.Disposable[] = [];
	
	private browserPage: BrowserPage | null;
	private browser: Browser;
	
	constructor(extensionPath: string, browser: Browser) {
		super();
		this._extensionPath = extensionPath;
		this._panel = null;
		this.browserPage = null;
		this.browser = browser;
	}

	public async initialize() {
		try {
			this.browserPage = await this.browser.newPage();
			if(this.browserPage) {
				this.browserPage.else((data: any) => {
					if(this._panel) {
						this._panel.webview.postMessage(data) 
					}
				})
			}
		} catch (err) {
			vscode.window.showErrorMessage(err)
		}		

		// Create and show a new webview panel
		let column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : vscode.ViewColumn.Two;

		if(!column) {
			column = vscode.ViewColumn.Two;
		}

		this._panel = vscode.window.createWebviewPanel(BrowserViewWindow.viewType, "BrowserView", column, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(this._extensionPath, 'build'))
			]
		});
		
		this._panel.webview.html = this._getHtmlForWebview();
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(message => {
			if(this.browserPage){
				try {
					this.browserPage.send(message.type, message.params, message.callbackId);
				} 
				catch(err) {
					vscode.window.showErrorMessage(err)
				}
			}
		}, null, this._disposables);		
	}

	public dispose() {
		if(this._panel) {
			this._panel.dispose();
		}

		if(this.browserPage) {
			this.browserPage.dispose();
			this.browserPage = null;
		}

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}

		this.emit('disposed');
	}

	private _getHtmlForWebview() {
		const manifest = require(path.join(this._extensionPath, 'build', 'asset-manifest.json'));
		const mainScript = manifest['main.js'];
		const mainStyle = manifest['main.css'];

		const scriptPathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'build', mainScript));
		const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
		const stylePathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'build', mainStyle));
		const styleUri = stylePathOnDisk.with({ scheme: 'vscode-resource' });

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<link rel="stylesheet" type="text/css" href="${styleUri}">
				<base href="${vscode.Uri.file(path.join(this._extensionPath, 'build')).with({ scheme: 'vscode-resource' })}/">
			</head>

			<body>
				<div id="root"></div>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}