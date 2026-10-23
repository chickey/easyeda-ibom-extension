![Hero](docs/ibom-github-hero.png?raw=true "Logo")
===========

`iBom for EasyEDA` is a native extension for [EasyEDA](https://easyeda.com/) and [LCEDA: Standard Edition](https://lceda.cn/standard). It is based on the awesome project called [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) designed and built by [qu1ck](https://github.com/qu1ck).

Although [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) already supports generation of `interactive BOMs` from `EasyEDA` projects, but it involves messing with `Python` scripts and requires to host the generated `html` files somewhere. Since my knowledge of `Python === null`, and my favorite tool for designing electronics is `EasyEDA` - I decided to give it a shot and port it as a native extension. 

Comparing to original solution, `iBom for EasyEDA` is available right within `EasyEDA` itself:
- There is no need to run any `Python` scripts.
- No need to host the produced `html` files.
- `iBom` is always accessible by clicking a single menu button from your `PCB` document!
- It also provides an ability to generate a stand-alone `HTML` representation the same way [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) does out of the box.

> NOTE: This extension is still in **ALPHA/BETA** stage - a lot of things should be done in order to make it fully compatible with `EasyEDA`. 

> This is a fork of [turbobabr/easyeda-ibom-extension](https://github.com/turbobabr/easyeda-ibom-extension) that adds supplier part numbers to the BOM and lets you choose which BOM columns are shown.

## Installation

1. Download [${downloadFileName}](${downloadUrl})
2. Un-zip the downloaded archive on your hard drive.
3. Go to `Extension Settings` dialog by using main menu `Advanced -> Extensions -> Extensions Settings...`.
4. Click `Load Extension...` button and add all the files in from the extracted folder using `Select Files...` button. 
5. Click `Load Extension` and close the `Extension Settings` dialog.

![iBom Installation](docs/ibom-installation.gif?raw=true "Installation")

## Usage

### Within EasyEDA

In order to launch `iBom` within the editor itself - just click on `iBom -> Launch...` menu item:

![iBom Demo](docs/ibom-demo.gif?raw=true "Demo")

You can always dismiss  the `iBom` view by clicking on the little `close` button located in the right-top corner of the panel.

### Generating stand-alone HTML representation

Just click `iBom -> Generate & Download HTML` menu item in order to get the stand-alone representation of your `PCB` document:

![iBom Demo](docs/ibom-stand-alone-generation.gif?raw=true "Demo")

> Note: In case the downloaded file doesn't have `.html` extension - just add it manually. It is some sort of weird browser behaviour for the case to be investigated.

### Supplier and manufacturer part numbers

If your parts have `Supplier Part` (e.g. an LCSC number like `C2887276`), `Supplier`, `Manufacturer` or `Manufacturer Part` attributes, they are shown as extra columns in the BOM. A column only appears when at least one part has a value for it. Parts with the same value and footprint but different part numbers get separate rows.

You can type a part number into the `Filter` box to find it on the board.

### Choosing which columns are shown

Open the settings menu (the cog icon at the top right of the `iBom` view) and use the `Bom columns` checkboxes to show or hide `References`, `Value`, `Footprint`, `Quantity` and any supplier/manufacturer columns. Your choice is remembered per board in the browser. Hidden columns are still searched by the `Filter` box.

The `Sourced`/`Placed` checkbox columns are set separately, in the `Bom checkboxes` box in the same menu.

## Building

The build tooling dates from 2021 and needs **Node 16** to build; `npm run build` fails on current Node versions. Install the dependencies with your normal `npm`, then let `npx` fetch Node 16 just for the build:

```bash
npm ci --ignore-scripts
npx -y -p node@16 -- npm run build
```

`--ignore-scripts` skips the `postinstall` setup script, which fails on current `npm` and isn't needed.

The built extension is written to `dist/`. Load the files from that folder as described in [Installation](#installation), starting from step 3.

Other scripts:
- `npm run build-docs` regenerates `README.md` from `README.template.md`. Edit the template, not `README.md`.
- `npm run release` bumps the patch version, builds, regenerates the docs and packages a zip into `releases/` for a GitHub release.

## Feedback

If you discover  any issue or have any suggestions for improvement of the plugin, please [open an issue](${issuesUrl}).

## Credits 

This is a fork of [iBom for EasyEDA](https://github.com/turbobabr/easyeda-ibom-extension) by [Andrey Shakhmin](https://github.com/turbobabr).

This solution uses:
- [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) as a core component. 
- A `"hackable"` nature of `EasyEDA/LCEDA` - thank you guys for allowing us messing with the product! 👏
- [svg-path-bbox](https://github.com/mondeja/svg-path-bbox) for calculating various bounding boxes during `EasyEDA` -> `InteractiveHTMLBOM` data conversions.

## License

MIT License

Copyright (c) 2021 Andrey Shakhmin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
