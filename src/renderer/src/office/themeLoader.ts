// Resolves the office theme into a renderable TiledMap.
//
// Vendored from munder-difflin (MIT). Kept as a function (not a constant) so the
// map JSON is parsed once at mount time, matching the original loader.

import type { TiledMap } from './TiledMapRenderer'
import { OFFICE_THEME, type ThemeConfig } from './themeRegistry'

/** Parse the theme's raw Tiled JSON and patch its tileset array so
 *  texture[i] lines up with tilesets[i]. */
export function resolveThemeMap(theme: ThemeConfig): TiledMap {
  const map = JSON.parse(theme.mapRaw) as TiledMap
  return {
    ...map,
    tilesets: theme.tilesets.map((entry, index) => {
      if (entry.embedded) return map.tilesets[index]
      const { url: _url, embedded: _embedded, ...meta } = entry
      return meta as TiledMap['tilesets'][number]
    })
  }
}

export function themeTilesetUrls(theme: ThemeConfig): string[] {
  return theme.tilesets.map((t) => t.url)
}

export function loadTheme(): ThemeConfig {
  return OFFICE_THEME
}
