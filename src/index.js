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
fs.writeFileSync('build/metadata.json', JSON.stringify({ locales }))

locales.forEach(locale => {
  fs.mkdirSync(`build/${locale}`, { recursive: true })
  logger.debug(`Fetching weapons page in ${locale}`)
  axios.get(`/weapons/index/${locale}`).then(({ data }) => {
    logger.info(`Got weapons page in ${locale}`)

    /*
      The FreeFire website loads the weapon cards as HTML inside
      a script tag, which is not queriable through cheerio. Here,
      we get the contents of that script tag and load it into another
      cheerio instance, which is then used for getting weapon
      information.
    */
    const $ = cheerio.load(cheerio.load(data)('script#weaponTpml').html())

    const commons = {
      attribute_names: {},
      attachment_names: {},
      attachment_hints: {},
      attachment_icons: {}
    }

    const weapons = $.root().find('body > li').map((_, weaponElement) => {
      const weapon = $('div', weaponElement)
      return {
        name: $('h4 > span:first-child', weapon).text(),
        ammunition: parseInt($('h4 > span.m-bullet', weapon).text()) || null,
        description: $('.m-weapon-txt', weapon).text(),
        skins: $('ul.m-weapon-item-list > li', weapon).map((_, skin) => ({
          id: parseInt($(skin).text()),
          default: $(skin).attr('data-img') === $('.m-weapon-gun > img', weapon).attr('src'),
          image_url: $(skin).attr('data-img')
        })).get(),
        attributes: attributeKeys.reduce((object, current, i) => {
          const attribute = $(`ul.m-weapon-data > li:nth-child(${++i})`, weapon)
          if (!commons.attribute_names[current]) commons.attribute_names[current] = $('div.txt', attribute).text()
          return {
            [current]: parseInt($('div.m-weapon-line > span.num', attribute).text()),
            ...object
          }
        }, {}),
        attachments: attachmentKeys.reduce((object, current, i) => {
          const attachment = $(`ul.m-weapon-config.item-list > li:nth-child(${++i}) > a`, weapon)
          const isAvaliable = !!$('div.u-hint-txt', attachment).length
          const hintOverride = !!$('div.u-hint-icon', attachment).length
          const hintText = $('div.u-hint-txt > span', attachment).text()
          const iconUrl = $('div.img > img', attachment).attr('src')
          if (!commons.attachment_names[current]) commons.attachment_names[current] = attachment.contents().last().text().trim()
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
        labels: $('div.m-weapon-label > span', weapon).map((_, labelElement) => $(labelElement).text()).get()
      }
    }).get()

    fs.writeFileSync(`build/${locale}/weapons.json`, JSON.stringify({ commons, weapons }))
  })
})
