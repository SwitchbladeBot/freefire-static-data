const cheerio = require('cheerio')
const Axios = require('axios').default
const fs = require('fs')

const locales = require('./locales.json')

const axios = Axios.create({
  baseURL: 'https://ff.garena.com'
})

const logger = console

const attributeKeys = [
  'damage',
  'rate_of_fire',
  'range',
  'reload_speed',
  'magazine',
  'accuracy',
  'movement_speed',
  'armor_penetration'
]

const attachmentKeys = [
  'silencer',
  'muzzle',
  'foregrip',
  'magazine',
  'scope',
  'stock'
]

if (fs.existsSync('build')) {
  logger.info('Old build directory found. Removing it.')
  fs.rmdirSync('build', { recursive: true })
}

fs.mkdirSync('build')
fs.writeFileSync(`build/metadata.json`, JSON.stringify({ locales }))

locales.forEach(locale => {
  fs.mkdirSync(`build/${locale}`, { recursive: true })
  logger.debug(`Fetching weapons page in ${locale}`)
  axios.get(`/weapons/index/${locale}`).then(response => {
    logger.info(`Got weapons page in ${locale}`)

    /*
      The FreeFire website loads the weapon cards as HTML inside
      a script tag, which is not queriable through cheerio. Here,
      we get the contents of that script tag and load it into another
      cheerio instance, which is then used for getting weapon
      information.
    */
    const $$ = cheerio.load(response.data)
    const weaponHTML = $$('script#weaponTpml').html()
    const $ = cheerio.load(`<html><body><ul>${weaponHTML}</ul></body></html>`)

    const commons = {
      attribute_names: {},
      attachment_names: {},
      attachment_hints: {},
      attachment_icons: {}
    }

    const weapons = $('body > ul > li').map((i, weaponElement) => {
      const weaponInstance = $(weaponElement).children('div')
      return {
        name: weaponInstance.children('h4').children('span').first().text(),
        ammunition: parseInt(weaponInstance.children('h4').children('span.m-bullet').text()) || null,
        description: weaponInstance.children('p.m-weapon-txt').children('span').text(),
        skins: $('ul.m-weapon-item-list.x-box.item-list > li', weaponElement).map((i, skinElement) => {
          return {
            id: parseInt($(skinElement).text()),
            default: $(skinElement).attr('data-img') === weaponInstance.children('div.m-weapon-gun').children('img').attr('src'),
            image_url: $(skinElement).attr('data-img')
          }
        }).toArray(),
        attributes: attributeKeys.reduce((object, current, index) => {
          const attributeInstance = weaponInstance.children('ul.m-weapon-data').children(`li:nth-child(${index + 1})`)
          if (!commons.attribute_names[current]) commons.attribute_names[current] = attributeInstance.children('div.txt').text()
          return {
            [current]: parseInt(attributeInstance.children('div.m-weapon-line').children('span.num').text()),
            ...object
          }
        }, {}),
        attachments: attachmentKeys.reduce((object, current, index) => {
          const attachmentInstance = $('ul.m-weapon-config.item-list', weaponElement).children(`li:nth-child(${index + 1})`).children('a')
          const isAvaliable = !!attachmentInstance.children('div.u-hint-txt').length
          const hintOverride = !!attachmentInstance.children('div.u-hint-icon').length
          const hintText = attachmentInstance.children('div.u-hint-txt').children('span').text()
          const iconUrl = attachmentInstance.children('div.img').children('img').attr('src')
          if (!commons.attachment_names[current]) commons.attachment_names[current] = attachmentInstance.clone().children().remove().end().text().trim()
          if (!commons.attachment_icons[current]) commons.attachment_icons[current] = {}
          if (!commons.attachment_icons[current][isAvaliable]) commons.attachment_icons[current][isAvaliable] = iconUrl
          if (!hintOverride && !commons.attachment_hints[current]) commons.attachment_hints[current] = hintText
          if (hintOverride && current === 'scope' && !commons.attachment_icons[current].pre_attached) commons.attachment_icons[current].pre_attached = iconUrl
          return {
            [current]: {
              avaliable: isAvaliable,
              ...hintOverride && { hint_override: hintText }
            },
            ...object
          }
        }, {}),
        labels: weaponInstance.children('div.m-weapon-label').children('span').map((index, labelElement) => {
          return $(labelElement).text()
        }).toArray()
      }
    }).toArray()

    fs.writeFileSync(`build/${locale}/weapons.json`, JSON.stringify({ commons, weapons }))
  })
})
