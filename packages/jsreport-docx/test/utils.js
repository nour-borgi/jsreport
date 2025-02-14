const { DOMParser } = require('@xmldom/xmldom')
const { decompress } = require('@jsreport/office')
const { nodeListToArray } = require('../lib/utils')

module.exports.getDocumentsFromDocxBuf = async function getDocumentsFromDocxBuf (docxBuf, documentPaths, options = {}) {
  const files = await decompress()(docxBuf)
  const targetFiles = []

  for (const documentPath of documentPaths) {
    const fileRef = files.find((f) => f.path === documentPath)
    targetFiles.push(fileRef)
  }

  const result = targetFiles.map((file) => (
    file != null ? new DOMParser().parseFromString(file.data.toString()) : null
  ))

  if (options.returnFiles) {
    return {
      files,
      documents: result
    }
  }

  return result
}

module.exports.getTextNodesMatching = function getTextNodesMatching (doc, targetText) {
  const allTextNodes = nodeListToArray(doc.getElementsByTagName('w:t')).filter((t) => {
    return t.textContent != null && t.textContent !== ''
  })

  let fullStr = ''

  for (const textNode of allTextNodes) {
    fullStr += textNode.textContent
  }

  const regexp = new RegExp(targetText)
  const match = fullStr.match(regexp)

  if (match == null) {
    return []
  }

  const target = {
    start: match.index,
    end: match.index + targetText.length - 1
  }

  const textNodesMatching = allTextNodes.reduce((acu, textNode) => {
    if (acu.complete) {
      return acu
    }

    const end = acu.start + (textNode.textContent.length - 1)

    if (
      (
        acu.start >= target.start &&
        acu.start <= target.end
      ) || (
        acu.end >= target.start &&
        acu.end <= target.end
      )
    ) {
      acu.nodes.push(textNode)
    }

    acu.start = end + 1

    if (acu.start > target.end) {
      acu.complete = true
    }

    return acu
  }, { start: 0, nodes: [], complete: false })

  return textNodesMatching.nodes
}

async function getImageEl (buf, _target, all = false) {
  const files = await decompress()(buf)
  const target = _target || 'word/document.xml'

  const file = files.find(f => f.path === target)

  if (file == null) {
    return all ? [] : undefined
  }

  const doc = new DOMParser().parseFromString(
    file.data.toString()
  )

  if (doc == null) {
    return all ? [] : undefined
  }

  const drawingEls = nodeListToArray(doc.getElementsByTagName('w:drawing'))
  const results = []

  for (const drawingEl of drawingEls) {
    const pictureEl = findDirectPictureChild(drawingEl)

    if (pictureEl == null) {
      continue
    }

    results.push(pictureEl)
  }

  return all ? results : results[0]
}

module.exports.getImageEl = getImageEl

module.exports.getImageSize = async function getImageSize (buf, _target, all = false) {
  const pictureEls = await getImageEl(buf, _target, true)
  const results = []

  for (const pictureEl of pictureEls) {
    const aExtEl = pictureEl.getElementsByTagName('a:xfrm')[0].getElementsByTagName('a:ext')[0]

    results.push({
      width: parseFloat(aExtEl.getAttribute('cx')),
      height: parseFloat(aExtEl.getAttribute('cy'))
    })
  }

  return all ? results : results[0]
}

module.exports.findDirectPictureChild = findDirectPictureChild

function findDirectPictureChild (parentNode) {
  const childNodes = parentNode.childNodes || []
  let pictureEl

  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i]

    if (child.nodeName === 'w:drawing') {
      break
    }

    if (child.nodeName === 'pic:pic') {
      pictureEl = child
      break
    }

    const foundInChild = findDirectPictureChild(child)

    if (foundInChild) {
      pictureEl = foundInChild
      break
    }
  }

  return pictureEl
}
