/** @jsx jsx */
import { React, AllWidgetProps, jsx, css, type SerializedStyles } from 'jimu-core'
import { type IMConfig } from './config'

interface State {
  svgHtml: string
  error: string | null
  rawSvg: string | null
}

export default class Widget extends React.PureComponent<AllWidgetProps<IMConfig>, State> {
  private refreshTimer?: number
  constructor (props) {
    super(props)
    this.state = { svgHtml: null, error: null, rawSvg: null }
  }

  componentDidMount(): void {
    this.updateFromConfig()
    this.setupRefreshTimer()
  }

  componentDidUpdate(prevProps: AllWidgetProps<IMConfig>): void {
    const cfg = this.props.config
    const prev = prevProps.config

    if (cfg.sourceUrl !== prev.sourceUrl || cfg.svgCode !== prev.svgCode) {
      this.updateFromConfig()
    } else if (cfg !== prev && this.state.rawSvg) {
      this.processSvg(this.state.rawSvg)
    }

    if (cfg.refreshInterval !== prev.refreshInterval || cfg.sourceUrl !== prev.sourceUrl) {
      this.setupRefreshTimer()
    }
  }

  componentWillUnmount(): void {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer)
  }

  setupRefreshTimer = (): void => {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer)
    const { refreshInterval, sourceUrl } = this.props.config
    if (refreshInterval && sourceUrl) {
      this.refreshTimer = window.setInterval(() => {
        this.fetchSvgFromUrl()
      }, refreshInterval)
    }
  }

  updateFromConfig = (): void => {
    const { svgCode, sourceUrl } = this.props.config
    if (sourceUrl) {
      this.fetchSvgFromUrl()
    } else if (svgCode && !svgCode.trim().startsWith('<!--')) {
      this.processSvg(svgCode)
    } else {
      this.setState({ svgHtml: null, error: null, rawSvg: null })
    }
  }

  fetchSvgFromUrl = async (): Promise<void> => {
    const { sourceUrl, apiToken } = this.props.config
    if (!sourceUrl) return
    try {
      const headers: Record<string, string> = { Accept: 'image/svg+xml,application/json,text/plain,*/*' }
      if (apiToken) headers.Authorization = `Bearer ${apiToken}`
      const res = await fetch(sourceUrl, { headers })
      if (!res.ok) {
        this.setState({ error: `Network error: ${res.status}` })
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        let data: any
        try {
          data = await res.json()
        } catch (err) {
          this.setState({ error: `Parse error: ${err.message}` })
          return
        }
        const isWave = sourceUrl.toLowerCase().includes('waveforecast')
        try {
          const svg = isWave
            ? this.renderFromWaveJson(data)
            : this.renderFromJson(data)
          this.processSvg(svg)
          if (typeof this.props.onSettingChange === 'function') {
            this.props.onSettingChange({ id: this.props.id, config: this.props.config.set('svgCode', svg) })
          }
        } catch (err) {
          const prefix = isWave ? 'Waveforecast JSON error' : 'JSON rendering error'
          this.setState({ error: `${prefix}: ${err.message}` })
        }
      } else {
        const text = await res.text()
        if (contentType.includes('image/svg+xml') || text.includes('<svg')) {
          this.processSvg(text)
          if (typeof this.props.onSettingChange === 'function') {
            this.props.onSettingChange({ id: this.props.id, config: this.props.config.set('svgCode', text) })
          }
        } else {
          this.setState({ error: 'Unsupported content type' })
        }
      }
    } catch (err) {
      this.setState({ error: `Network error: ${err.message}` })
    }
  }

  renderFromJson = (data: any): string => {
    if (data && typeof data.svg === 'string') return data.svg
    throw new Error('Invalid JSON format')
  }

  renderFromWaveJson = (data: any): string => {
    const series = data?.properties?.timeseries
    if (!Array.isArray(series) || series.length === 0) {
      throw new Error('Missing timeseries in Waveforecast data')
    }

    const points = series.map((s: any) => {
      const details = s?.data?.instant?.details || s?.data?.details || {}
      const height = details.sea_surface_wave_height ?? details.wave_height
      const period = details.sea_surface_wave_mean_period ?? details.wave_period
      const direction = details.sea_surface_wave_from_direction ?? details.wave_direction
      if (height === undefined || height === null) {
        throw new Error('Wave height missing in timeseries')
      }
      return { time: s.time, height, period, direction }
    })

    const maxHeight = Math.max(...points.map(p => p.height)) || 1
    const barWidth = 40
    const chartHeight = 100
    const width = points.length * barWidth
    const height = chartHeight + 40

    const svgParts: string[] = []
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`)
    points.forEach((p, i) => {
      const h = (p.height / maxHeight) * chartHeight
      const x = i * barWidth + 5
      const y = chartHeight - h + 20
      svgParts.push(`<rect x="${x}" y="${y}" width="${barWidth - 10}" height="${h}" fill="#006edb" />`)
      svgParts.push(`<text x="${x + (barWidth / 2)}" y="${chartHeight + 15}" font-size="10" text-anchor="middle">${p.height}</text>`)
      if (p.period !== undefined && p.period !== null) {
        svgParts.push(`<text x="${x + (barWidth / 2)}" y="10" font-size="8" text-anchor="middle">${p.period}s</text>`)
      }
      if (p.direction !== undefined && p.direction !== null) {
        svgParts.push(`<text x="${x + (barWidth / 2)}" y="${y - 5}" font-size="8" text-anchor="middle">${p.direction}°</text>`)
      }
    })
    svgParts.push('</svg>')
    return svgParts.join('')
  }

  processSvg = (svgCode: string): void => {
    const { config } = this.props
    const doc = new DOMParser().parseFromString(svgCode, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) { this.setState({ error: 'Invalid SVG content' }); return }

    if (!svg.hasAttribute('viewBox')) {
      const w = svg.getAttribute('width')?.replace('px', '')
      const h = svg.getAttribute('height')?.replace('px', '')
      if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    }

    svg.querySelectorAll('style').forEach(s => s.remove())
    svg.querySelectorAll('filter').forEach(f => f.remove())
    svg.querySelectorAll('[filter]').forEach(n => n.removeAttribute('filter'))

    const isWhite = (v?: string | null) => {
      const t = (v || '').trim().toLowerCase()
      return t === '#fff' || t === '#ffffff' || t === 'white' || t === 'rgb(255,255,255)'
    }
    svg.querySelectorAll('rect').forEach(r => {
      const fill = r.getAttribute('fill')
      const style = r.getAttribute('style') || ''
      if (isWhite(fill) || /(^|;)\s*fill\s*:\s*(#fff|#ffffff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*;?/i.test(style)) {
        r.setAttribute('fill', 'none')
        r.setAttribute('style', style.replace(/(^|;)\s*fill\s*:\s*[^;]+;?/ig, '$1'))
      }
    })
    svg.querySelectorAll('foreignObject').forEach(fo => {
      const html = fo.querySelector('*') as HTMLElement | null
      if (html) html.setAttribute('style', `${html.getAttribute('style') || ''};background:${config.overallBackground} !important;`)
    })

    this.setState({ svgHtml: svg.outerHTML, error: null, rawSvg: svgCode })
  }

  buildScopedCss = (config: IMConfig, scope: string) => `
    .${scope} { background-color: ${config.overallBackground}; position: relative; }

    .${scope} .svg-image-container svg { width:100%; height:100%; display:block; background-color:${config.overallBackground} !important; }

    /* Text */
    .${scope} .svg-image-container svg .location-header,
    .${scope} .svg-image-container svg .day-label,
    .${scope} .svg-image-container svg .served-by-header,
    .${scope} .svg-image-container svg .legend-label,
    .${scope} .svg-image-container svg text { fill: ${config.mainTextColor} !important; }
    .${scope} .svg-image-container svg .hour-label,
    .${scope} .svg-image-container svg .y-axis-label { fill: ${config.secondaryTextColor} !important; }

    /* Axis/X icons colored */
    .${scope} .svg-image-container svg g[filter*="invert"] { filter:none !important; }
    .${scope} .svg-image-container svg [fill="#56616c"],
    .${scope} .svg-image-container svg [stroke="#56616c"],
    .${scope} .svg-image-container svg [style*="fill:#56616c"],
    .${scope} .svg-image-container svg [style*="stroke:#56616c"],
    .${scope} .svg-image-container svg [style*="rgb(86,97,108)"] {
      fill: ${config.yAxisIconColor} !important;
      stroke: ${config.yAxisIconColor} !important;
    }
    .${scope} .svg-image-container svg [stroke="currentColor"] { stroke: ${config.yAxisIconColor} !important; }
    .${scope} .svg-image-container svg [fill="currentColor"]   { fill: ${config.yAxisIconColor} !important; }

    /* Grid */
    .${scope} .svg-image-container svg line[stroke="#c3d0d8"],
    .${scope} .svg-image-container svg line[stroke="#56616c"] {
      stroke: ${config.gridLineColor} !important;
      stroke-width: ${config.gridLineWidth}px !important;
      stroke-opacity: ${config.gridLineOpacity} !important;
    }

    /* Series lines */
    .${scope} .svg-image-container svg path[stroke="url(#temperature-curve-gradient)"] { stroke: ${config.temperatureLineColor} !important; }
    .${scope} .svg-image-container svg path[stroke="#aa00f2"]:not([stroke-dasharray]) { stroke: ${config.windLineColor} !important; }
    .${scope} .svg-image-container svg path[stroke="#aa00f2"][stroke-dasharray] { stroke: ${config.windGustLineColor} !important; }

    /* Legend chips (inline <svg> blocks) */
    /* Temperature chip is red by default */
    .${scope} .svg-image-container svg svg rect[fill="#c60000"] { fill: ${config.temperatureLineColor} !important; }

    /* Wind m/s chip: solid purple rect WITHOUT rx */
    .${scope} .svg-image-container svg svg rect[fill="#aa00f2"]:not([rx]) { fill: ${config.windLineColor} !important; }

    /* Wind gust chip: purple rect WITH rx (rounded) */
    .${scope} .svg-image-container svg svg rect[fill="#aa00f2"][rx] { fill: ${config.windGustLineColor} !important; }

    /* Precipitation */
    .${scope} .svg-image-container svg rect[fill="#006edb"] { fill: ${config.precipitationBarColor} !important; }
    .${scope} .svg-image-container svg line[stroke="#006edb"],
    .${scope} .svg-image-container svg path[stroke="#006edb"] { stroke: ${config.precipitationBarColor} !important; }

    .${scope} .svg-image-container svg #max-precipitation-pattern rect { fill: ${config.maxPrecipitationColor} !important; opacity: 0.3 !important; }
    .${scope} .svg-image-container svg #max-precipitation-pattern line { stroke: ${config.maxPrecipitationColor} !important; opacity: 1 !important; }

    /* Coastal graph series */
    .${scope} .coast-graph__wind { color: ${config.coastWindColor} !important; }
    .${scope} .graph-line--dashed.coast-graph__wind { color: ${config.coastWindGustColor} !important; }
    .${scope} .coast-graph__wave-height { color: ${config.waveHeightColor} !important; }
    .${scope} .coast-graph__sea-current { color: ${config.seaCurrentColor} !important; }
    .${scope} .graph-temperature-line>.graph-line:not(.graph-line--dashed) { color: ${config.seaAirTempColor} !important; }
    .${scope} .graph-temperature-line>.graph-line--dashed { color: ${config.seaWaterTempColor} !important; }

    /* Coastal graph legend chips */
    .${scope} [data-type="wind-curve"] .graph-legend-new__line { color: ${config.coastWindColor} !important; }
    .${scope} [data-type="wind-gust-curve"] .graph-legend-new__line { color: ${config.coastWindGustColor} !important; }
    .${scope} [data-type="wave-height-curve"] .graph-legend-new__line { color: ${config.waveHeightColor} !important; }
    .${scope} [data-type="sea-current-curve"] .graph-legend-new__line { color: ${config.seaCurrentColor} !important; }
    .${scope} [data-type="sea-air-temp-curve"] .graph-legend-new__line { color: ${config.seaAirTempColor} !important; }
    .${scope} [data-type="sea-water-temp-curve"] .graph-legend-new__line { color: ${config.seaWaterTempColor} !important; }

    /* Logos */
    .${scope} .svg-image-container svg svg[x="16"] circle { fill: ${config.yrLogoBackgroundColor} !important; }
    .${scope} .svg-image-container svg svg[x="16"] path   { fill: ${config.yrLogoTextColor} !important; }
    .${scope} .svg-image-container svg svg[x="624"] path,
    .${scope} .svg-image-container svg svg[x="675.5"] path { fill: ${config.logoColor} !important; }
  `

  getStyle = (config: IMConfig): SerializedStyles => css`
    & {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: ${config.padding ?? 0}px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .svg-image-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
  `

  render(): React.ReactElement {
    const { config, id } = this.props
    const { error, svgHtml } = this.state
    const scopeClass = `yrw-${id}`

    if (error) return <div style={{ padding: '10px', textAlign: 'center', color: 'red' }}>{error}</div>

    return (
      <div className={scopeClass} css={this.getStyle(config)}>
        <style dangerouslySetInnerHTML={{ __html: this.buildScopedCss(config, scopeClass) }} />

        {svgHtml
          ? <div className="svg-image-container" dangerouslySetInnerHTML={{ __html: svgHtml }} />
          : <div style={{ padding: 10, textAlign: 'center' }}>
              Please provide SVG Code.
            </div>}
      </div>
    )
  }
}
