import _ from 'lodash';
import { convert } from './converter';
import { fetchModels } from './model3d/fetch';
import { encodeModels } from './model3d/pack';
import { resolveLibraryModels } from './model3d/lookup';

export const buildModels3D = (pcbdata, onProgress = () => {}) => {
  onProgress('Looking up 3D models...');
  return resolveLibraryModels(pcbdata.models3d.placements, pcbdata.footprints).then((placements) => {
    const uuids = _.compact(_.map(placements, placement => placement && placement.uuid));
    return uuids.length === 0 ? null : downloadModels(pcbdata, uuids, onProgress);
  });
};

const downloadModels = (pcbdata, uuids, onProgress) => {
  return fetchModels(uuids, (done, total) => {
    onProgress(`Downloading 3D models ${done}/${total}...`);
  }).then(({ models, failed }) => {
    pcbdata.models3d.missing = failed;
    onProgress('Packing 3D models...');
    return models.length > 0 ? encodeModels(models) : null;
  });
};

// options.include3D: embed the 3D viewer and models (default true).
// options.onProgress: called with a short status message while generating.
export const buildIBomHTML = (source, meta, bom, options = {}) => {
  const include3D = options.include3D !== false;
  const onProgress = options.onProgress || (() => {});

  const fileURLs = easyeda.extension.instances.ibom.blobURLs;
  const ignoreList = ['main.js', 'icon.svg', 'manifest.json', 'locale.txt'];
  if (!include3D) {
    ignoreList.push('viewer3d.js');
  }

  const urls = _.chain(fileURLs)
    .map((value, key) => [key, value])
    .filter(pair => !_.includes(ignoreList, pair[0]))
    .fromPairs()
    .value();

  const fetchFile = (fileName, url) => {
    return fetch(url).then((res) => {
      return res.text();
    }).then((content) => {
      return Promise.resolve({
        fileName,
        url,
        content
      });
    });
  };

  const fetchAll = () => {
    return Promise.all(_.map(urls, (url, fileName) => fetchFile(fileName, url))).then((files) => {
      return Promise.resolve(_.chain(files).map(file => [file.fileName, file]).fromPairs().value())
    });
  };

  const pcbdata = convert(source, meta, bom);
  if (!include3D) {
    delete pcbdata.models3d;
  }

  const models3D = include3D ? buildModels3D(pcbdata, onProgress) : Promise.resolve(null);

  return Promise.all([fetchAll(), models3D]).then(([files, encodedModels]) => {
    return assembleIBomHTML(_.mapValues(files, file => file.content), pcbdata, encodedModels);
  });
};

// Fills the ibom.html template. files maps asset names (ibom.html, ibom.js...) to their text.
export const assembleIBomHTML = (files, pcbdata, encodedModels) => {
  const defaultConfig = {
    "show_fabrication": false,
    "redraw_on_drag": true,
    "highlight_pin1": false,
    "extra_fields": [],
    "hidden_columns": [],
    "dark_mode": false,
    "bom_view": "left-right",
    "board_rotation": 0.0,
    "checkboxes": "Sourced,Placed",
    "show_silkscreen": true,
    "show_pads": true,
    "layer_view": "FB",
    "extra_fields": pcbdata.bom.customColumns
  };

  const replacePlan = {
    '///CSS///': 'ibom.css',
    '///USERCSS///': ' ',
    '///SPLITJS///': 'split.js',
    '///LZ-STRING///': 'lz-string.js',
    '///POINTER_EVENTS_POLYFILL///': 'pep.js',
    '///CONFIG///': `var config = ${JSON.stringify(defaultConfig)};`,
    '///PCBDATA///': `var pcbdata = ${JSON.stringify(pcbdata)};`,
    '///MODELS3D///': `var pcbmodels = ${JSON.stringify(encodedModels)};`,
    // Keep a "</script>" inside the bundle from closing the page's script tag.
    '///VIEWER3DJS///': files['viewer3d.js'] ? files['viewer3d.js'].replace(/<\/script/gi, '<\\/script') : ' ',
    '///UTILJS///': 'util.js',
    '///RENDERJS///': 'render.js',
    '///IBOMJS///': 'ibom.js',
    '///USERJS///': ' ',
    '///USERFOOTER///': '<!-- USERFOOTER -->',
    '///USERHEADER///': '<!-- USERHEADER -->'
  };

  let html = files['ibom.html'];
  _.each(replacePlan, (content, marker) => {
    const replacement = _.has(files, content) ? files[content] : content;
    // A function avoids "$&" style patterns in the content being expanded.
    html = html.replace(marker, () => replacement);
  });

  return html;
};
