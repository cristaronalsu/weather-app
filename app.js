const $ = id => document.getElementById(id)
const fetchBtn = $('fetchBtn')
const result = $('result')
const cityInput = $('city')
const suggestionsEl = $('suggestions')
const weatherCard = $('weatherCard')
const placeholder = $('placeholder')
const placeEl = $('place')
const timeEl = $('time')
const tempEl = $('temp')
const descEl = $('desc')
const windEl = $('wind')
const recommendEl = $('recommend')
const saveFavBtn = $('saveFavBtn')
const favWeatherBtn = $('favWeatherBtn')

function showMessage(html){
  // place message in the placeholder area without tearing down weatherCard
  if (placeholder){ placeholder.innerHTML = html; placeholder.hidden = false }
  if (weatherCard) weatherCard.hidden = true
}

function showSkeleton(){
  if (weatherCard){
    weatherCard.hidden = false
    placeholder.hidden = true
    tempEl.textContent = ''
    descEl.textContent = ''
    windEl.textContent = ''
    recommendEl.textContent = ''
    // insert spinner if not present
    if (!document.querySelector('.spinner')){
      const s = document.createElement('div')
      s.className = 'spinner'
      s.style.position = 'absolute'
      s.style.right = '22px'
      s.style.top = '22px'
      weatherCard.appendChild(s)
    }
  }
}

function hideSkeleton(){
  const sp = document.querySelector('.spinner')
  if (sp) sp.remove()
}

function cacheKey(lat, lon){
  return `weather_cache_${lat.toFixed(2)}_${lon.toFixed(2)}`
}

function storeCache(lat, lon, payload){
  try{ localStorage.setItem(cacheKey(lat,lon), JSON.stringify({ts:Date.now(), data:payload})) }catch(e){}
}

function loadCachedWeatherIfFresh(lat, lon, maxMinutes=10){
  try{
    const raw = localStorage.getItem(cacheKey(lat,lon))
    if (!raw) return false
    const parsed = JSON.parse(raw)
    if (!parsed.ts || (Date.now() - parsed.ts) > maxMinutes*60*1000) return false
    const payload = parsed.data
    // populate UI quickly
    placeEl.textContent = `${lat.toFixed(2)}, ${lon.toFixed(2)}`
    timeEl.textContent = payload.timezone || ''
    const unitVal = $('unit') ? $('unit').value : 'C'
    let displayTemp = payload.tempC
    let unitLabel = '°C'
    if (unitVal === 'F'){
      displayTemp = Math.round((payload.tempC * 9/5 + 32) * 10) / 10
      unitLabel = '°F'
    }
    tempEl.textContent = `${displayTemp}${unitLabel}`
    descEl.textContent = weatherCodeToText(payload.wcode)
    windEl.textContent = payload.windspeed ? `Wind: ${payload.windspeed} km/h` : ''
    recommendEl.textContent = recommendOutfit(payload.tempC, payload.wcode)
    weatherCard.hidden = false
    placeholder.hidden = true
    return true
  }catch(e){ return false }
}

function recommendOutfit(tempC, weathercode){
  let base = ''
  if (tempC <= 0) base = 'Very cold — wear a heavy coat, hat, scarf and gloves.'
  else if (tempC <= 10) base = 'Cold — wear a warm coat and layers.'
  else if (tempC <= 18) base = 'Cool — wear a jacket or sweater.'
  else if (tempC <= 24) base = 'Mild — light layers or long sleeve should be fine.'
  else base = 'Warm — short sleeve and light clothing, consider shorts.'

  // weathercode 0 is clear — other codes often mean clouds or precipitation
  let extra = ''
  if (typeof weathercode !== 'undefined' && weathercode !== 0) {
    extra = ' Also consider bringing a light rain jacket or umbrella.'
  }

  return base + extra
}

async function fetchWeather(lat, lon){
  // try to show cached result immediately for perceived speed
  const showedCache = loadCachedWeatherIfFresh(lat, lon, 10)
  if (!showedCache) showSkeleton()
  try{
    // Use Open-Meteo current_weather when available
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json()

    let temp = null
    let wcode = undefined

    if (data.current_weather && typeof data.current_weather.temperature !== 'undefined'){
      temp = data.current_weather.temperature
      wcode = data.current_weather.weathercode
    } else if (data.hourly && data.hourly.temperature_2m){
      // try to get the most recent hourly value
      const temps = data.hourly.temperature_2m
      temp = temps[0]
    } else if (data.temperature_2m){
      temp = data.temperature_2m
    }

    if (temp === null || typeof temp === 'undefined'){
      showMessage('<p class="muted">Could not find current temperature in response.</p>')
      hideSkeleton()
      return
    }

    // Respect unit selection (C or F)
    const unitVal = $('unit') ? $('unit').value : 'C'
    let displayTemp = temp
    let unitLabel = '°C'
    if (unitVal === 'F'){
      displayTemp = Math.round((temp * 9/5 + 32) * 10) / 10
      unitLabel = '°F'
    }

    const outfit = recommendOutfit(temp, wcode)

    // populate weather card
    placeEl.textContent = `${lat.toFixed(2)}, ${lon.toFixed(2)}`
    timeEl.textContent = data.timezone || ''
    tempEl.textContent = `${displayTemp}${unitLabel}`
    descEl.textContent = weatherCodeToText(wcode)
    windEl.textContent = data.current_weather && data.current_weather.windspeed ? `Wind: ${data.current_weather.windspeed} km/h` : ''
    // show emoji icon and outfit emoji
    const icon = $('icon')
    if (icon) icon.textContent = weatherCodeToEmoji(wcode)
    recommendEl.innerHTML = `<span class="emoji-item">${outfitEmojiForTemp(temp)}</span>${outfit}`

    // cache for quick reloads
    storeCache(lat, lon, {tempC: temp, wcode: wcode, windspeed: data.current_weather && data.current_weather.windspeed, timezone: data.timezone})

    // show card
    weatherCard.hidden = false
    placeholder.hidden = true
    suggestionsEl.hidden = true
    hideSkeleton()
  }catch(err){
    showMessage(`<p class="muted">Error fetching weather: ${err.message}</p>`)
    hideSkeleton()
  }
}

fetchBtn.addEventListener('click', ()=>{
  const lat = parseFloat($('lat').value) || 42.33
  const lon = parseFloat($('lon').value) || -83.05
  fetchWeather(lat, lon)
})

saveFavBtn && saveFavBtn.addEventListener('click', ()=>{
  const name = cityInput.value || `${$('lat').value},${$('lon').value}`
  const lat = parseFloat($('lat').value)
  const lon = parseFloat($('lon').value)
  saveFavoriteToServer(name, lat, lon)
  // also save to localStorage for fallback
  try{ localStorage.setItem('fav_city', JSON.stringify({name,lat,lon})) }catch(e){}
  // update search box to show saved favorite
  if (cityInput) cityInput.value = name
})

favWeatherBtn && favWeatherBtn.addEventListener('click', async ()=>{
  // try server first
  try{
    const res = await fetch('http://localhost:8080/favorite')
    if (res.ok){
      const d = await res.json()
      if (d && d.lat && d.lon){
        if (cityInput) cityInput.value = d.name || `${d.lat},${d.lon}`
        fetchWeather(parseFloat(d.lat), parseFloat(d.lon))
        return
      }
    }
  }catch(e){/* ignore */}

  // fallback to localStorage
  try{
    const raw = localStorage.getItem('fav_city')
    if (!raw) { alert('No favorite saved'); return }
    const f = JSON.parse(raw)
    if (f && f.lat && f.lon){
      if (cityInput) cityInput.value = f.name || `${f.lat},${f.lon}`
      fetchWeather(parseFloat(f.lat), parseFloat(f.lon))
    } else alert('No favorite saved')
  }catch(e){ alert('No favorite saved') }
})

// Try geolocation on load for faster local weather
window.addEventListener('load', ()=>{
  if (navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const la = pos.coords.latitude
      const lo = pos.coords.longitude
      $('lat').value = la
      $('lon').value = lo
      // immediately try to show cached, then fetch fresh
      fetchWeather(la, lo)
    }, ()=>{}, {timeout:3000})
  }
  // try to load favorite from local server
  loadFavoriteFromServer()
})

async function loadFavoriteFromServer(){
  try{
    const res = await fetch('http://localhost:8080/favorite')
    if (!res.ok) return
    const data = await res.json()
    if (data && data.lat && data.lon){
      $('lat').value = parseFloat(data.lat)
      $('lon').value = parseFloat(data.lon)
      cityInput.value = data.name || ''
      fetchWeather(parseFloat(data.lat), parseFloat(data.lon))
    }
  }catch(e){
    // server likely not running — ignore
  }
}

async function saveFavoriteToServer(name, lat, lon){
  try{
    await fetch('http://localhost:8080/favorite', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name, lat, lon})
    })
  }catch(e){}
}

// ------- Geocoding search (Open-Meteo geocoding API) -------
let geoTimeout = null
cityInput && cityInput.addEventListener('input', (e)=>{
  const q = e.target.value.trim()
  if (geoTimeout) clearTimeout(geoTimeout)
  if (!q) { suggestionsEl.hidden = true; return }
  geoTimeout = setTimeout(()=> searchCity(q), 300)
})

// Show favorite suggestion when focusing the search box
cityInput && cityInput.addEventListener('focus', async (e)=>{
  try{
    const fav = await getFavoriteForSuggestion()
    if (!fav) return
    // prepend favorite suggestion
    const li = document.createElement('li')
    li.className = 'favorite-suggestion'
    const flag = countryCodeToEmoji(fav.country_code || '')
    li.innerHTML = `<span class="flag">${flag}</span> <strong>★ ${fav.name || (fav.display || '')}</strong> <span class="muted">(favorite)</span>`
    li.addEventListener('click', ()=>{
      if (fav.lat && fav.lon){
        $('lat').value = fav.lat
        $('lon').value = fav.lon
        cityInput.value = fav.name || (fav.display || '')
        suggestionsEl.hidden = true
        fetchWeather(parseFloat(fav.lat), parseFloat(fav.lon))
      }
    })
    // show it alone if no current suggestions
    suggestionsEl.insertBefore(li, suggestionsEl.firstChild)
    suggestionsEl.hidden = false
  }catch(e){/* ignore */}
})

async function getFavoriteForSuggestion(){
  // try server
  try{
    const res = await fetch('http://localhost:8080/favorite')
    if (res.ok){
      const d = await res.json()
      if (d && d.lat && d.lon) return {name: d.name, lat: d.lat, lon: d.lon}
    }
  }catch(e){}
  // fallback localStorage
  try{
    const raw = localStorage.getItem('fav_city')
    if (!raw) return null
    const f = JSON.parse(raw)
    if (f && f.lat && f.lon) return {name: f.name, lat: f.lat, lon: f.lon}
  }catch(e){}
  return null
}

async function searchCity(q){
  try{
    // increase count and allow worldwide results
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=50&language=en&format=json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json()
    const results = (data.results || [])
    renderSuggestions(results)
  }catch(err){
    console.error('geocode error', err)
    suggestionsEl.hidden = true
  }
}

function renderSuggestions(list){
  suggestionsEl.innerHTML = ''
  if (!list.length){
    const li = document.createElement('li')
    li.className = 'no-results'
    li.textContent = 'No results — try a different spelling or include country.'
    suggestionsEl.appendChild(li)
    suggestionsEl.hidden = false
    return
  }

  list.forEach(item =>{
    const li = document.createElement('li')
    const flag = countryCodeToEmoji(item.country_code)
    const region = item.admin1 ? `, ${item.admin1}` : ''
    li.innerHTML = `<span class="flag">${flag}</span> ${item.name}${region} <span class="muted">(${item.country})</span>`
    li.addEventListener('click', ()=>{
      // set lat/lon and fetch
      $('lat').value = item.latitude
      $('lon').value = item.longitude
      cityInput.value = `${item.name}${region}`
      suggestionsEl.hidden = true
      fetchWeather(item.latitude, item.longitude)
    })
    suggestionsEl.appendChild(li)
  })
  suggestionsEl.hidden = false
}

function countryCodeToEmoji(cc){
  if (!cc) return ''
  try{
    return cc.toUpperCase().replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)))
  }catch(e){ return '' }
}

function outfitEmojiForTemp(tempC){
  if (tempC <= 0) return '🧣'
  if (tempC <= 10) return '🧥'
  if (tempC <= 18) return '🧶'
  if (tempC <= 24) return '👕'
  return '🩳'
}

// Small mapping of weathercode to text
function weatherCodeToText(code){
  const map = {
    0: 'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
    45:'Fog',48:'Depositing rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',
    61:'Slight rain',63:'Moderate rain',65:'Heavy rain',
    71:'Slight snow',73:'Moderate snow',75:'Heavy snow',
    80:'Rain showers',95:'Thunderstorm'
  }
  return map[code] || ''
}

function weatherCodeToEmoji(code){
  // approximate mapping to friendly emojis
  if (code === 0) return '☀️'
  if (code === 1 || code === 2) return '🌤️'
  if (code === 3) return '☁️'
  if ([45,48].includes(code)) return '🌫️'
  if ([51,53,55,61,63,65,80].includes(code)) return '🌧️'
  if ([71,73,75].includes(code)) return '❄️'
  if (code === 95) return '⛈️'
  return '❔'
}
