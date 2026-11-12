import _ from 'lodash';
import format from 'date-fns/format';
import { registerCommand, getSource, getActiveTabInfo, getGVars, getBOMFromPCBEditor, makeCommandId, getManifest } from './easy-api';
import { replaceVars } from './utils';
import { isRunnerAround } from './runner-api';
import './styles.scss';
import frameHTML from './frame.html';
import { buildIBomHTML } from './html-builder';


const fetchMeta = () => {
  const meta = {
    title: 'Project Name',
    owner: 'Unknown Company',
    date: format(new Date(), 'yyyy-MM-dd'),
    revision: '0'
  };

  const pcbInfo = getActiveTabInfo();
  if (pcbInfo) {
    meta.title = pcbInfo.title || meta.title;
  }

  const gVars = getGVars();
  if (gVars) {
    const username = _.get(gVars, 'globalVariableCookieData.easyeda_user.username');
    if (username) {
      meta.owner = username;
    }
  }

  return Promise.resolve(meta);
};

registerCommand('showInteractiveBOM', () => {

  const manifest = getManifest();  
  const frameHTMLWithVersion = replaceVars(frameHTML, {
    version: manifest.version
  });

  $('body').append(frameHTMLWithVersion);
  $('#ibom-close-button').click(() => {
    $('#ibom-container').remove();
  });

  const setStatus = (text) => {
    $('#ibom-status').text(text || '');
  };

  fetchMeta().then((meta) => {
    const bom = getBOMFromPCBEditor();
    return buildIBomHTML(getSource(), meta, bom, { onProgress: setStatus }).then((html) => {
      setStatus('');
      setTimeout(() => {
        $('#the-frame').attr('srcdoc', html);
      }, 1);
    });
  }).catch((error) => {
    console.log('[iBom]: Failed to build iBom', error);
    setStatus(`Failed to build iBom: ${error.message}`);
  });
});


const generateAndDownload = (include3D) => {
  fetchMeta().then((meta) => {
    const bom = getBOMFromPCBEditor();
    return buildIBomHTML(getSource(), meta, bom, { include3D }).then((html) => {
      // A Blob URL copes with large files (embedded 3D models) better than a data: URL.
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const fakeLinkTag = document.createElement('a');
      document.body.appendChild(fakeLinkTag);
      fakeLinkTag.download = `${meta.title}_rev${meta.revision}.html`;
      fakeLinkTag.href = url;
      fakeLinkTag.click();
      document.body.removeChild(fakeLinkTag);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }).catch((error) => {
    console.log('[iBom]: Failed to generate iBom HTML', error);
  });
};

registerCommand('generateAndDownload', () => generateAndDownload(true));

registerCommand('generateAndDownload2D', () => generateAndDownload(false));

registerCommand('visitGithubPage', () => {
  window.open('https://github.com/chickey/easyeda-ibom-extension', '_blank');  
});

if(!isRunnerAround()) {
  api('createToolbarButton', {    
    fordoctype: 'pcb',
    menu: [
      {
        text: 'Launch...',
        cmd: makeCommandId('showInteractiveBOM')
      },
      {
        text: 'Generate & Download HTML',
        cmd: makeCommandId('generateAndDownload')
      },
      {
        text: 'Generate & Download HTML (2D only)',
        cmd: makeCommandId('generateAndDownload2D')
      },
      '-',
      {
        text: 'Visit Github Page...',
        cmd: makeCommandId('visitGithubPage')
      }
    ]
  });
}
