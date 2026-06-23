// =====================================================
// GitHub Pages 静态部署兼容补丁 V2
// 作用：让路线规划、模拟轨迹、用户点评在 GitHub Pages 上也能运行
// 必须放在 main.js 最上面
// =====================================================
(function () {
    if (window.__githubPagesPatchInstalledV2) {
        return;
    }

    window.__githubPagesPatchInstalledV2 = true;

    // 修复旧代码调用 fixCustomAttractionData 报错
    window.fixCustomAttractionData = function () {
        try {
            if (typeof supplementProvinceCityAttractions === 'function') {
                supplementProvinceCityAttractions();
            }
            if (typeof normalizeAttractionCategories === 'function') {
                normalizeAttractionCategories();
            }
            if (typeof normalizeAttractionProvinceCityFields === 'function') {
                normalizeAttractionProvinceCityFields();
            }
            if (typeof refreshAllQueryAnalysisDropdowns === 'function') {
                refreshAllQueryAnalysisDropdowns();
            }
        } catch (e) {
            console.warn('fixCustomAttractionData 已跳过非关键错误：', e);
        }
    };

    const originalFetch = window.fetch.bind(window);

    function makeJsonResponse(data) {
        return Promise.resolve(
            new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            })
        );
    }

    // 从 URL 里取参数
    function getUrlParam(urlText, key) {
        try {
            const query = urlText.split('?')[1] || '';
            const params = new URLSearchParams(query);
            return params.get(key) || '';
        } catch (e) {
            return '';
        }
    }

    // 判断是不是经纬度字符串，例如 117.98,30.00
    function parseCoordinateText(text) {
        if (!text) return null;

        text = decodeURIComponent(String(text));

        const parts = text.split(',');
        if (parts.length !== 2) {
            return null;
        }

        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);

        if (isNaN(lon) || isNaN(lat)) {
            return null;
        }

        return [lon, lat];
    }

    // 根据景点名称找坐标
    function findAttractionCoordinateByName(nameText) {
        if (!nameText || typeof attractionsSource === 'undefined' || !attractionsSource) {
            return null;
        }

        const keyword = decodeURIComponent(String(nameText)).trim();

        if (!keyword) {
            return null;
        }

        const feature = attractionsSource.getFeatures().find(function (item) {
            const name =
                item.get('name') ||
                item.get('title') ||
                item.get('名称') ||
                '';

            return name === keyword || name.indexOf(keyword) !== -1 || keyword.indexOf(name) !== -1;
        });

        if (feature && feature.getGeometry()) {
            return feature.getGeometry().getCoordinates();
        }

        return null;
    }

    // 把 origin / destination 变成坐标
    function resolveRoutePoint(text) {
        return (
            parseCoordinateText(text) ||
            findAttractionCoordinateByName(text) ||
            null
        );
    }

    // 计算两点之间的大概距离，单位米
    function calculateDistanceMeters(coord1, coord2) {
        if (typeof ol !== 'undefined' && ol.sphere && ol.sphere.getDistance) {
            return ol.sphere.getDistance(coord1, coord2);
        }

        const dx = coord1[0] - coord2[0];
        const dy = coord1[1] - coord2[1];
        return Math.sqrt(dx * dx + dy * dy) * 111000;
    }

    // 生成一条稍微弯曲的模拟路线
    function createMockRouteCoords(start, end, offsetRate) {
        offsetRate = offsetRate || 0;

        const coords = [];
        const count = 24;

        const dx = end[0] - start[0];
        const dy = end[1] - start[1];

        for (let i = 0; i <= count; i++) {
            const t = i / count;

            let lon = start[0] + dx * t;
            let lat = start[1] + dy * t;

            // 让线稍微弯一点，看起来不像完全直线
            const curve = Math.sin(Math.PI * t) * 0.08;
            lon += -dy * curve + offsetRate;
            lat += dx * curve + offsetRate;

            coords.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
        }

        return coords;
    }

    // 把坐标数组转成高德路线接口常见的 polyline 格式
    function coordsToPolyline(coords) {
        return coords.map(function (coord) {
            return coord[0] + ',' + coord[1];
        }).join(';');
    }

    // 生成模拟路线接口返回值
    function createMockRouteResponse(urlText) {
        const originText = getUrlParam(urlText, 'origin');
        const destinationText = getUrlParam(urlText, 'destination');

        let start = resolveRoutePoint(originText);
        let end = resolveRoutePoint(destinationText);

        // 如果实在解析不到，就用当前地图中心兜底
        if (!start && typeof map !== 'undefined') {
            start = map.getView().getCenter();
        }

        if (!end && typeof map !== 'undefined') {
            const center = map.getView().getCenter();
            end = [center[0] + 0.05, center[1] + 0.05];
        }

        if (!start || !end) {
            start = [116.397, 39.908];
            end = [116.407, 39.918];
        }

        const distance = calculateDistanceMeters(start, end);
        const duration = Math.max(600, distance / 8);

        const mainCoords = createMockRouteCoords(start, end, 0);
        const altCoords = createMockRouteCoords(start, end, 0.015);

        return {
            status: '1',
            info: 'GitHub Pages 静态模拟路线',
            route: {
                paths: [
                    {
                        distance: String(Math.round(distance)),
                        duration: String(Math.round(duration)),
                        steps: [
                            {
                                road: '模拟推荐路线',
                                polyline: coordsToPolyline(mainCoords),
                                traffic_status: 1
                            }
                        ]
                    },
                    {
                        distance: String(Math.round(distance * 1.18)),
                        duration: String(Math.round(duration * 1.25)),
                        steps: [
                            {
                                road: '模拟备选路线',
                                polyline: coordsToPolyline(altCoords),
                                traffic_status: 2
                            }
                        ]
                    }
                ]
            }
        };
    }

    // 根据景点名生成本地模拟点评
    function createMockPoiDetailResponse(urlText) {
        const name = decodeURIComponent(getUrlParam(urlText, 'name') || '该景点');

        const reviews = [
            {
                user: '游客A',
                date: '2026-06-01',
                rating: 5,
                content: name + '景色很有特色，适合拍照和文化体验。'
            },
            {
                user: '游客B',
                date: '2026-05-18',
                rating: 4,
                content: '整体游览体验不错，路线安排合理会更轻松。'
            },
            {
                user: '游客C',
                date: '2026-05-03',
                rating: 5,
                content: '文旅资源丰富，适合加入主题游览路线。'
            }
        ];

        return {
            success: true,
            status: '1',
            name: name,
            avgRating: '4.8',
            total: reviews.length,
            source: '本地模拟数据',
            reviews: reviews,
            data: {
                name: name,
                reviews: reviews
            }
        };
    }

    window.fetch = function (input, init) {
        const urlText = typeof input === 'string'
            ? input
            : input && input.url
                ? input.url
                : '';

        const lowerUrl = urlText.toLowerCase();

        // 路线规划接口：路线规划和模拟轨迹都会用到它
        if (lowerUrl.includes('api/route')) {
            return makeJsonResponse(createMockRouteResponse(urlText));
        }

        // 用户点评 / POI 详情接口
        if (lowerUrl.includes('api/poi/detail')) {
            return makeJsonResponse(createMockPoiDetailResponse(urlText));
        }

        // 收藏状态检查接口：改成本地收藏夹检查
        if (lowerUrl.includes('api/favorites/check')) {
            let attractionId = '';

            try {
                const query = urlText.split('?')[1] || '';
                const params = new URLSearchParams(query);
                attractionId = params.get('id') || params.get('attractionId') || params.get('name') || '';
            } catch (e) {
                attractionId = '';
            }

            let isFav = false;

            try {
                const favorites = JSON.parse(localStorage.getItem('zhiyou_mingcheng_favorites_final') || '[]');
                isFav = favorites.some(function (item) {
                    return String(item.id) === String(attractionId) || String(item.name) === String(attractionId);
                });
            } catch (e) {
                isFav = false;
            }

            return makeJsonResponse({
                success: true,
                isFavorite: isFav,
                favorite: isFav
            });
        }

        // 天气接口：静态模拟
        if (lowerUrl.includes('api/weather')) {
            return makeJsonResponse({
                success: true,
                weather: '晴',
                temperature: '25℃',
                humidity: '60%',
                wind: '微风',
                description: '当前为 GitHub Pages 静态展示数据',
                data: {
                    weather: '晴',
                    temperature: '25℃',
                    humidity: '60%',
                    wind: '微风'
                }
            });
        }

        // 空气质量接口：静态模拟
        if (lowerUrl.includes('api/airquality')) {
            return makeJsonResponse({
                success: true,
                aqi: 68,
                quality: '良',
                pm25: 35,
                pm10: 58,
                description: '当前为 GitHub Pages 静态展示数据',
                data: {
                    aqi: 68,
                    quality: '良',
                    pm25: 35,
                    pm10: 58
                }
            });
        }

        // 其他正常文件照常加载，例如 data/attractions.geojson
        return originalFetch(input, init);
    };
})();

let currentSelectedFeature = null;
window.currentSelectedFeature = null;
window.lastAirQualityParams = null;

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const tHour = typeof t === 'function' ? t('route.hour') : '小时';
    const tMinute = typeof t === 'function' ? t('route.minute') : '分钟';
    if (hours > 0) {
        return `${hours}${tHour}${minutes}${tMinute}`;
    } else {
        return `${minutes}${tMinute}`;
    }
}

function getAttractionName(feature) {
    if (!feature) return '';
    const name = feature.get('name') || '';
    
    const langFieldMap = {
        'en': 'name_en',
        'zh-TW': 'name_zhTW',
        'ko': 'name_ko',
        'ja': 'name_ja'
    };
    
    const langField = langFieldMap[window.currentLang];
    if (langField) {
        const translatedName = feature.get(langField);
        if (translatedName) return translatedName;
    }
    
    return name;
}

function getAttractionCategory(feature) {
    if (!feature) return '';
    const category = feature.get('category') || '';
    
    const langFieldMap = {
        'en': 'category_en',
        'zh-TW': 'category_zhTW',
        'ko': 'category_ko',
        'ja': 'category_ja'
    };
    
    const langField = langFieldMap[window.currentLang];
    if (langField) {
        const translatedCategory = feature.get(langField);
        if (translatedCategory) return translatedCategory;
    }
    
    return category;
}

function getGeoJSONFeatureName(props) {
    if (!props) return '';
    const name = props.name || '';
    
    const langFieldMap = {
        'en': 'name_en',
        'zh-TW': 'name_zhTW',
        'ko': 'name_ko',
        'ja': 'name_ja'
    };
    
    const langField = langFieldMap[window.currentLang];
    if (langField && props[langField]) {
        return props[langField];
    }
    
    return name;
}

function getGeoJSONFeatureCategory(props) {
    if (!props) return '';
    const category = props.category || '';
    
    const langFieldMap = {
        'en': 'category_en',
        'zh-TW': 'category_zhTW',
        'ko': 'category_ko',
        'ja': 'category_ja'
    };
    
    const langField = langFieldMap[window.currentLang];
    if (langField && props[langField]) {
        return props[langField];
    }
    
    return category;
}

function getTranslatedProperty(props, propName) {
    if (!props || !propName) return '';
    const defaultValue = props[propName] || '';
    
    const langFieldMap = {
        'en': propName + '_en',
        'zh-TW': propName + '_zhTW',
        'ko': propName + '_ko',
        'ja': propName + '_ja'
    };
    
    const langField = langFieldMap[window.currentLang];
    if (langField && props[langField]) {
        return props[langField];
    }
    
    return defaultValue;
}

function getTrafficColor(status) {
    if (!status) return '#2196F3';
    
    const statusNum = typeof status === 'string' ? parseInt(status) : status;
    
    switch(statusNum) {
        case 1:
            return '#00e400';
        case 2:
            return '#ffff00';
        case 3:
            return '#ff7e00';
        case 4:
            return '#ff0000';
        default:
            return '#2196F3';
    }
}

function getTrafficIcon(status) {
    const color = getTrafficColor(status);
    const bgColor = status >= 3 ? '#fff' : color;
    const textColor = status >= 3 ? color : '#fff';
    
    const icons = {
        1: '✓',
        2: '⚠',
        3: '⚠',
        4: '✕'
    };
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="10" fill="${bgColor}" stroke="${color}" stroke-width="2"/>
        <text x="12" y="17" font-size="14" font-weight="bold" fill="${textColor}" text-anchor="middle">${icons[status] || '?'}</text>
    </svg>`;
}

function getTrafficLabel(status) {
    switch(status) {
        case 1: return '畅行';
        case 2: return '缓行';
        case 3: return '拥堵';
        case 4: return '严重拥堵';
        default: return '';
    }
}

const map = new ol.Map({
    target: 'map',
    view: new ol.View({
        center: [104.195, 35.862],
        zoom: 4,
        projection: 'EPSG:4326'
    })
});

const scaleLineControl = new ol.control.ScaleLine({
    units: 'metric'
});
map.addControl(scaleLineControl);


// 鼠标坐标显示控件
const mousePositionControl = new ol.control.MousePosition({
    coordinateFormat: ol.coordinate.createStringXY(6),
    projection: 'EPSG:4326',
    target: document.getElementById('mouse-position'),
    undefinedHTML: '鼠标坐标：--'
});
map.addControl(mousePositionControl);

// 鹰眼图控件
const overviewMapControl = new ol.control.OverviewMap({
    collapsed: false,
    layers: [
        new ol.layer.Tile({
            source: new ol.source.XYZ({
                crossOrigin: 'anonymous',
                url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
            })
        })
    ]
});
map.addControl(overviewMapControl);

window.lastWeatherData = null;

function translateWeatherCondition(condition) {
    if (typeof t !== 'function') return condition;
    const conditionMap = {
        '晴': t('weather.conditionSunny'),
        '多云': t('weather.conditionCloudy'),
        '阴': t('weather.conditionOvercast'),
        '小雨': t('weather.conditionRain'),
        '中雨': t('weather.conditionRain'),
        '大雨': t('weather.conditionRain'),
        '雨': t('weather.conditionRain'),
        '小雪': t('weather.conditionSnow'),
        '中雪': t('weather.conditionSnow'),
        '大雪': t('weather.conditionSnow'),
        '雪': t('weather.conditionSnow'),
        '沙尘': t('weather.conditionDust'),
        '雾': t('weather.conditionFog'),
        '霾': t('weather.conditionFog')
    };
    for (let key in conditionMap) {
        if (condition.includes(key)) {
            return conditionMap[key];
        }
    }
    return condition;
}

function translateWindDir(windDir) {
    if (typeof t !== 'function') return windDir;
    const dirMap = {
        '北': t('weather.windNorth'),
        '南': t('weather.windSouth'),
        '东': t('weather.windEast'),
        '西': t('weather.windWest'),
        '东北': t('weather.windNortheast'),
        '东南': t('weather.windSoutheast'),
        '西北': t('weather.windNorthwest'),
        '西南': t('weather.windSouthwest')
    };
    for (let key in dirMap) {
        if (windDir.includes(key)) {
            return dirMap[key];
        }
    }
    return windDir;
}

function renderWeather(data) {
    document.getElementById('weatherIcon').textContent = data.icon;
    document.getElementById('weatherTemp').textContent = data.temp;
    document.getElementById('weatherHumidity').textContent = data.humidity;
    document.getElementById('weatherAqi').textContent = data.aqi;
    
    const translatedCondition = translateWeatherCondition(data.condition);
    document.getElementById('weatherCondition').textContent = translatedCondition;
    
    const translatedWindDir = translateWindDir(data.windDir);
    const windLevelSuffix = typeof t === 'function' ? t('weather.windLevel') : '级';
    document.getElementById('weatherWind').textContent = translatedWindDir + ' ' + data.windSpeed + windLevelSuffix;
}

function loadWeather(lon, lat) {
    let url = '/api/weather';
    if (lon && lat) {
        url += `?lon=${lon}&lat=${lat}`;
    }
    fetch(url)
        .then(res => res.json())
        .then(data => {
            window.lastWeatherData = data;
            renderWeather(data);
        })
        .catch(err => {
            console.error('天气加载失败:', err);
        });
}

const baseLayers = {
    osm: new ol.layer.Tile({
        source: new ol.source.OSM(),
        visible: true
    }),

    satellite: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        }),
        visible: false
    }),

    terrain: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png'
        }),
        visible: false
    }),

    gaode: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
        }),
        visible: false
    }),

    gaodeSatellite: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'
        }),
        visible: false
    })
};

// 多源底图配置
const basemaps = {
    // 高德普通地图：默认显示，保证页面一打开就有底图
    osm: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            attributions: '© 高德地图'
        }),
        title: '高德地图',
        visible: true
    }),

    // Esri 卫星影像
    satellite: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attributions: 'Tiles © Esri'
        }),
        title: 'Esri卫星影像',
        visible: false
    }),

    // OpenTopoMap 地形图
    terrain: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
            attributions: '© OpenTopoMap'
        }),
        title: 'OpenTopoMap地形图',
        visible: false
    }),

    // 高德卫星
    gaodeSatellite: new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            attributions: '© 高德卫星'
        }),
        title: '高德卫星',
        visible: false
    })
};

Object.values(basemaps).forEach(function(layer) {
    layer.setZIndex(0);   // 底图永远放在最底层
    map.addLayer(layer);
});

const attractionsSource = new ol.source.Vector();
let attractionsFeaturesList = [];
let attractionsLayer = new ol.layer.Vector({
    source: attractionsSource,
    style: function(feature) {
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({
                    color: '#e74c3c'
                }),
                stroke: new ol.style.Stroke({
                    color: '#ffffff',
                    width: 3
                })
            }),
            text: new ol.style.Text({
                text: getAttractionName(feature) || '',
                font: 'bold 13px Noto Serif SC, STKaiti, KaiTi, serif',
                fill: new ol.style.Fill({
                    color: '#b22126'
                }),
                stroke: new ol.style.Stroke({
                    color: '#ffffff',
                    width: 3
                }),
                offsetY: -18,
                textAlign: 'center',
                textBaseline: 'bottom'
            })
        });
    },
    visible: true,
zIndex: 100
});
map.addLayer(attractionsLayer);
attractionsLayer.setVisible(true);
attractionsLayer.setZIndex(100);
// 景点聚类图层
const clusterSource = new ol.source.Cluster({
    distance: 45,
    minDistance: 15,
    source: attractionsSource
});

const clusterLayer = new ol.layer.Vector({
    source: clusterSource,
    visible: false,
    zIndex: 180,
    style: function(feature) {
        const features = feature.get('features');
        const size = features.length;

        let radius = 10;
        let fillColor = 'rgba(178, 33, 38, 0.85)';

        if (size >= 10) {
            radius = 22;
            fillColor = 'rgba(255, 69, 0, 0.9)';
        } else if (size >= 5) {
            radius = 18;
            fillColor = 'rgba(255, 140, 0, 0.9)';
        } else if (size >= 2) {
            radius = 14;
            fillColor = 'rgba(255, 193, 7, 0.9)';
        }

        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: radius,
                fill: new ol.style.Fill({
                    color: fillColor
                }),
                stroke: new ol.style.Stroke({
                    color: '#ffffff',
                    width: 3
                })
            }),
            text: new ol.style.Text({
                text: size > 1 ? String(size) : '',
                fill: new ol.style.Fill({
                    color: '#ffffff'
                }),
                stroke: new ol.style.Stroke({
                    color: '#8b1a1a',
                    width: 2
                }),
                font: 'bold 14px Microsoft YaHei'
            })
        });
    }
});

map.addLayer(clusterLayer);
// 属性查询结果高亮图层
const searchResultSource = new ol.source.Vector();

const searchResultLayer = new ol.layer.Vector({
    source: searchResultSource,
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 10,
            fill: new ol.style.Fill({
                color: 'rgba(255, 193, 7, 0.95)'
            }),
            stroke: new ol.style.Stroke({
                color: '#b22126',
                width: 3
            })
        })
    }),
    zIndex: 200
});

map.addLayer(searchResultLayer);
// 景点热力图图层
// 使用 attractionsSource 作为数据源，评分越高热力权重越大
const heatmapLayer = new ol.layer.Heatmap({
    source: attractionsSource,
    blur: 25,
    radius: 25,
    opacity: 0.9,
    visible: false,
    zIndex: 9,
    weight: function(feature) {
        const rating = Number(feature.get('rating'));

        if (!isNaN(rating)) {
            return Math.min(rating / 5, 1);
        }

        return 0.6;
    }
});

map.addLayer(heatmapLayer);
// 缓冲区分析图层
const bufferSource = new ol.source.Vector();

const bufferLayer = new ol.layer.Vector({
    source: bufferSource,
    style: new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(0, 123, 255, 0.18)'
        }),
        stroke: new ol.style.Stroke({
            color: '#007bff',
            width: 3,
            lineDash: [8, 6]
        })
    }),
    zIndex: 8
});

map.addLayer(bufferLayer);

// 叠加分析图层：用于显示用户绘制的分析区域，以及落入区域内的景点高亮点
const overlayAnalysisSource = new ol.source.Vector();

const overlayAnalysisLayer = new ol.layer.Vector({
    source: overlayAnalysisSource,
    style: function(feature) {
        const analysisType = feature.get('analysisType');

        // 命中的景点高亮样式
        if (analysisType === 'overlayPoint') {
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 8,
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 87, 34, 0.95)'
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#ffffff',
                        width: 3
                    })
                }),
                text: new ol.style.Text({
                    text: feature.get('label') || '',
                    font: 'bold 12px Microsoft YaHei',
                    fill: new ol.style.Fill({
                        color: '#b22126'
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#ffffff',
                        width: 3
                    }),
                    offsetY: -16
                })
            });
        }

        // 用户绘制的叠加分析区域样式
        return new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 193, 7, 0.22)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ff9800',
                width: 3,
                lineDash: [10, 6]
            })
        });
    },
    zIndex: 210
});

map.addLayer(overlayAnalysisLayer);

const drawSource = new ol.source.Vector();
const drawLayer = new ol.layer.Vector({
    source: drawSource,
    style: new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(255, 193, 7, 0.3)'
        }),
        stroke: new ol.style.Stroke({
            color: '#ffc107',
            width: 2
        }),
        image: new ol.style.Circle({
            radius: 8,
            fill: new ol.style.Fill({
                color: '#ffc107'
            }),
            stroke: new ol.style.Stroke({
                color: '#ffffff',
                width: 2
            })
        })
    }),
    zIndex: 5
});
map.addLayer(drawLayer);

const trackSource = new ol.source.Vector();
const trackLayer = new ol.layer.Vector({
    source: trackSource,
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#e91e63',
            width: 4
        })
    }),
    zIndex: 4
});
map.addLayer(trackLayer);

const trackMarkerSource = new ol.source.Vector();
const trackMarkerLayer = new ol.layer.Vector({
    source: trackMarkerSource,
    style: new ol.style.Style({
        image: new ol.style.Icon({
            src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23e91e63" width="32" height="32"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
            scale: 1.2,
            anchor: [0.5, 1]
        })
    }),
    zIndex: 6
});
map.addLayer(trackMarkerLayer);

let trackAnimation = null;
let savedTracks = [];

fetch('data/attractions.geojson')
    .then(res => res.json())
    .then(data => {
        const features = new ol.format.GeoJSON().readFeatures(data);
        attractionsSource.addFeatures(features);
        attractionsFeaturesList = features;
        
        const menu = document.getElementById('attractionsMenu');
        menu.innerHTML = '';
        data.features.forEach(f => {
            const props = f.properties;
            const li = document.createElement('li');
            li.innerHTML = `<a class="dropdown-item" href="#" onclick="queryAttraction(${props.id})">${props.name}</a>`;
            menu.appendChild(li);
        });
        
        updateAttractionsListContent(data.features);
        
        const extent = attractionsSource.getExtent();
        map.getView().fit(extent, { 
            padding: [50, 50, 50, 50],
            minZoom: 8
        });
    })
    .catch(err => console.error('加载景点数据失败:', err));

let drawInteraction = null;
let selectInteraction = null;
let modifyInteraction = null;

function switchBasemap(type) {
    Object.keys(basemaps).forEach(function(key) {
        basemaps[key].setVisible(key === type);
    });
}

function resetView() {
    // 复位前先关闭临时绘制/查询监听，避免和复位冲突
    if (typeof clearDraw === 'function') {
        clearDraw();
    }

    if (typeof clearBoxSelectListeners === 'function') {
        clearBoxSelectListeners();
    }

    if (typeof clearCircleSelectListeners === 'function') {
        clearCircleSelectListeners();
    }

    if (typeof clearPolygonSelectListeners === 'function') {
        clearPolygonSelectListeners();
    }

    if (typeof clearTwoClickQueryListeners === 'function') {
        clearTwoClickQueryListeners();
    }

    // 清除分析/查询临时图层，但不要清空景点图层
    if (typeof drawSource !== 'undefined' && drawSource) {
        drawSource.clear();
    }

    if (typeof bufferSource !== 'undefined' && bufferSource) {
        bufferSource.clear();
    }

    if (typeof overlayAnalysisSource !== 'undefined' && overlayAnalysisSource) {
        overlayAnalysisSource.clear();
    }

    if (typeof searchResultSource !== 'undefined' && searchResultSource) {
        searchResultSource.clear();
    }

    if (typeof trackSource !== 'undefined' && trackSource) {
        trackSource.clear();
    }

    if (typeof trackMarkerSource !== 'undefined' && trackMarkerSource) {
        trackMarkerSource.clear();
    }

    // 确保普通景点图层显示，关闭聚类和热力图
    if (typeof attractionsLayer !== 'undefined' && attractionsLayer) {
        attractionsLayer.setVisible(true);
        attractionsLayer.setZIndex(1000);
    }

    if (typeof clusterLayer !== 'undefined' && clusterLayer) {
        clusterLayer.setVisible(false);
    }

    if (typeof heatmapLayer !== 'undefined' && heatmapLayer) {
        heatmapLayer.setVisible(false);
    }

    // 重新加载基础景点，然后立刻补回 main.js 里新增的景点
    fetch('data/attractions.geojson')
        .then(function(res) {
            return res.json();
        })
        .then(function(data) {
            const baseFeatures = new ol.format.GeoJSON().readFeatures(data);

            attractionsSource.clear();
            attractionsSource.addFeatures(baseFeatures);

            // 关键：复位后马上补回后来新增的景点
            if (typeof supplementProvinceCityAttractions === 'function') {
                supplementProvinceCityAttractions();
            }

            if (typeof normalizeAttractionCategories === 'function') {
                normalizeAttractionCategories();
            }

            if (typeof normalizeAttractionProvinceCityFields === 'function') {
                normalizeAttractionProvinceCityFields();
            }

            if (typeof assignRandomRatingsToAttractions === 'function') {
                assignRandomRatingsToAttractions();
            }

            if (typeof removeDuplicateAttractionsByName === 'function') {
                removeDuplicateAttractionsByName();
            }

            // 更新全局景点列表，避免下拉框还拿旧数据
            attractionsFeaturesList = attractionsSource.getFeatures().filter(function(feature) {
                return feature.getGeometry();
            });

            // 刷新所有景点相关下拉框
            if (typeof refreshAttractionQueryDropdown === 'function') {
                refreshAttractionQueryDropdown();
            }

            if (typeof refreshRouteAndTrackAttractionSelects === 'function') {
                refreshRouteAndTrackAttractionSelects();
            }

            if (typeof forceRefreshRouteAndTrackSelects === 'function') {
                forceRefreshRouteAndTrackSelects();
            }

            if (typeof refreshAllQueryAnalysisDropdowns === 'function') {
                refreshAllQueryAnalysisDropdowns();
            }

            const extent = attractionsSource.getExtent();

            if (!ol.extent.isEmpty(extent)) {
                map.getView().fit(extent, {
                    padding: [50, 50, 50, 50],
                    duration: 500,
                    maxZoom: 8
                });
            }

            map.renderSync();
        })
        .catch(function(err) {
            console.error('复位失败:', err);
            alert('复位失败，请检查 data/attractions.geojson 是否能正常加载。');
        });
}

function startDraw(type) {
    clearDraw();
    drawInteraction = new ol.interaction.Draw({
        source: drawSource,
        type: type,
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 193, 7, 0.3)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ffc107',
                width: 2
            }),
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({
                    color: '#ffc107'
                })
            })
        })
    });
    map.addInteraction(drawInteraction);
    
    drawInteraction.on('drawend', function(evt) {
        const feature = evt.feature;
        feature.setProperties({
            type: 'user_draw',
            geometryType: type,
            createdAt: new Date().toISOString()
        });
    });
}

// 绘制矩形
function startRectangleDraw() {
    clearDraw();

    drawInteraction = new ol.interaction.Draw({
        source: drawSource,
        type: 'Circle',
        geometryFunction: ol.interaction.Draw.createBox(),
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 193, 7, 0.3)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ffc107',
                width: 2
            })
        })
    });

    map.addInteraction(drawInteraction);

    drawInteraction.on('drawend', function(evt) {
        const feature = evt.feature;
        feature.setProperties({
            type: 'user_draw',
            geometryType: 'Rectangle',
            createdAt: new Date().toISOString()
        });
    });
}

// 启用要素编辑
function enableFeatureEdit() {
    clearDraw();

    // 多选编辑：单击一个要素选中，再单击其他要素继续加入选择
    // 已选中的要素再次单击会取消选择
    selectInteraction = new ol.interaction.Select({
        layers: [drawLayer],

        // 单击触发选择
        condition: ol.events.condition.click,

        // 每次单击都作为“切换选择”，不会自动清空之前选中的要素
        toggleCondition: ol.events.condition.click,

        // 同一位置如果有多个要素，允许一起被识别
        multi: true,

        // 增大一点点击容差，更容易点中线、面边界
        hitTolerance: 8,

        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 87, 34, 0.25)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ff5722',
                width: 3,
                lineDash: [8, 6]
            }),
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({
                    color: '#ff5722'
                }),
                stroke: new ol.style.Stroke({
                    color: '#ffffff',
                    width: 2
                })
            })
        })
    });

    modifyInteraction = new ol.interaction.Modify({
        features: selectInteraction.getFeatures()
    });

    map.addInteraction(selectInteraction);
    map.addInteraction(modifyInteraction);

    alert('已进入多选编辑模式：单击要素可选中，继续单击其他要素可多选；再次单击已选要素可取消选择。选中后拖动节点进行编辑。');
}

// 删除选中的绘制要素
function deleteSelectedFeature() {
    if (!selectInteraction) {
        alert('请先点击“编辑要素”，再选择要删除的要素。');
        return;
    }

    const selectedFeatures = selectInteraction.getFeatures();

    if (selectedFeatures.getLength() === 0) {
        alert('请先在地图上点击选择一个要素。');
        return;
    }

    selectedFeatures.forEach(function(feature) {
        drawSource.removeFeature(feature);
    });

    selectedFeatures.clear();
    alert('已删除选中要素。');
}

// 开始测量：distance 表示距离测量，area 表示面积测量
function startMeasure(measureType) {
    clearDraw();

    const drawType = measureType === 'distance' ? 'LineString' : 'Polygon';

    drawInteraction = new ol.interaction.Draw({
        source: drawSource,
        type: drawType,
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(0, 123, 255, 0.2)'
            }),
            stroke: new ol.style.Stroke({
                color: '#007bff',
                width: 3,
                lineDash: [10, 10]
            }),
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({
                    color: '#007bff'
                })
            })
        })
    });

    map.addInteraction(drawInteraction);

    if (measureType === 'distance') {
        alert('距离测量已开启：请在地图上依次点击绘制路线，双击结束。');
    } else {
        alert('面积测量已开启：请在地图上点击绘制区域，双击结束。');
    }

    drawInteraction.on('drawend', function(evt) {
    const feature = evt.feature;
    const geometry = feature.getGeometry();
    const projection = map.getView().getProjection();

    let result = '';

    if (measureType === 'distance') {
        const length = ol.sphere.getLength(geometry, {
            projection: projection
        });

        result = formatLength(length);

        feature.setProperties({
            type: 'measure',
            measureType: 'distance',
            result: result,
            createdAt: new Date().toISOString()
        });

        alert('距离测量结果：' + result);
    } else {
        const area = ol.sphere.getArea(geometry, {
            projection: projection
        });

        result = formatArea(area);

        feature.setProperties({
            type: 'measure',
            measureType: 'area',
            result: result,
            createdAt: new Date().toISOString()
        });

        alert('面积测量结果：' + result);
    }

    // 用户点击弹窗“确定”后，自动清除本次测量绘制的要素
    setTimeout(function() {
        if (drawSource && feature) {
            drawSource.removeFeature(feature);
        }
    }, 0);
});
}

// 格式化距离
function formatLength(length) {
    if (length >= 1000) {
        return (length / 1000).toFixed(2) + ' 公里';
    } else {
        return length.toFixed(2) + ' 米';
    }
}

// 格式化面积
function formatArea(area) {
    if (area >= 1000000) {
        return (area / 1000000).toFixed(2) + ' 平方千米';
    } else {
        return area.toFixed(2) + ' 平方米';
    }
}

// 地图截图导出
// 注意：部分在线底图存在跨域限制，无法被浏览器导出到 canvas
function exportMapImage() {
    map.once('rendercomplete', function() {
        const mapCanvas = document.createElement('canvas');
        const size = map.getSize();

        mapCanvas.width = size[0];
        mapCanvas.height = size[1];

        const mapContext = mapCanvas.getContext('2d');

        let skippedLayerCount = 0;

        Array.prototype.forEach.call(
            document.querySelectorAll('.ol-layer canvas'),
            function(canvas) {
                if (canvas.width <= 0 || canvas.height <= 0) {
                    return;
                }

                const opacity = canvas.parentNode.style.opacity;
                mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);

                const transform = canvas.style.transform;
                let matrix;

                if (transform && transform.startsWith('matrix')) {
                    matrix = transform
                        .match(/^matrix\(([^\(]*)\)$/)[1]
                        .split(',')
                        .map(Number);
                } else {
                    matrix = [
                        parseFloat(canvas.style.width) / canvas.width,
                        0,
                        0,
                        parseFloat(canvas.style.height) / canvas.height,
                        0,
                        0
                    ];
                }

                mapContext.setTransform.apply(mapContext, matrix);

                try {
                    // 先检测这个 canvas 是否被跨域污染
                    // 如果污染了，toDataURL 会报错
                    canvas.toDataURL('image/png');

                    mapContext.drawImage(canvas, 0, 0);
                } catch (err) {
                    skippedLayerCount++;
                    console.warn('该图层存在跨域限制，截图时已跳过：', err);
                }
            }
        );

        mapContext.globalAlpha = 1;
        mapContext.setTransform(1, 0, 0, 1, 0, 0);

        try {
            const link = document.createElement('a');
            link.download = 'webgis-map-screenshot.png';
            link.href = mapCanvas.toDataURL('image/png');
            link.click();

            if (skippedLayerCount > 0) {
                alert(
                    '截图已导出，但有 ' +
                    skippedLayerCount +
                    ' 个底图图层存在跨域限制，可能没有显示在截图中。建议切换到支持跨域的 OSM 底图后再截图。'
                );
            }
        } catch (err) {
            console.error(err);
            alert('地图截图导出失败：当前底图存在跨域限制，浏览器不允许导出该底图。请切换到 OSM 底图，或使用浏览器/系统截图。');
        }
    });

    map.renderSync();
}

function clearDraw() {
    if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
    }
    if (selectInteraction) {
        map.removeInteraction(selectInteraction);
        selectInteraction = null;
    }
    if (modifyInteraction) {
        map.removeInteraction(modifyInteraction);
        modifyInteraction = null;
    }
    if (trackDrawInteraction) {
        map.removeInteraction(trackDrawInteraction);
        trackDrawInteraction = null;
    }
    if (trackDrawInteraction) {
        map.removeInteraction(trackDrawInteraction);
        trackDrawInteraction = null;
    }
    if (trackAnimation) {
        cancelAnimationFrame(trackAnimation);
        trackAnimation = null;
    }
    document.getElementById('attractionsList').style.display = 'none';
}

function clearFeatures() {
    drawSource.clear();
    if (typeof bufferSource !== 'undefined') {
        bufferSource.clear();
    }
    if (typeof searchResultSource !== 'undefined') {
        searchResultSource.clear();
    }
    trackSource.clear();
    trackMarkerSource.clear();
    
    if (trackAnimation) {
        cancelAnimationFrame(trackAnimation);
        trackAnimation = null;
    }
    
    map.getLayers().forEach(layer => {
        if (layer instanceof ol.layer.Vector) {
            const source = layer.getSource();
            if (source && source instanceof ol.source.Vector) {
                if (source !== attractionsSource && source !== drawSource && source !== trackSource && source !== trackMarkerSource) {
                    source.clear();
                }
            }
        }
    });
    
    document.getElementById('featureInfo').innerHTML = t('infoPanel.clickFeature');
}

// ===== 单击两次确定矩形范围的框选查询 =====
let boxSelectStartCoord = null;
let boxSelectFeature = null;
let boxSelectClickKey = null;
let boxSelectMoveKey = null;

// 清除框选查询事件监听
function clearBoxSelectListeners() {
    if (boxSelectClickKey) {
        ol.Observable.unByKey(boxSelectClickKey);
        boxSelectClickKey = null;
    }

    if (boxSelectMoveKey) {
        ol.Observable.unByKey(boxSelectMoveKey);
        boxSelectMoveKey = null;
    }

    boxSelectStartCoord = null;
}

// 框选查询：第一次单击确定起点，第二次单击确认范围
function startBoxSelect() {
    clearDraw();
    clearBoxSelectListeners();

    // 确保绘制图层可见，否则框选范围可能看不到
    if (typeof drawLayer !== 'undefined' && drawLayer) {
        drawLayer.setVisible(true);
        drawLayer.setZIndex(1200);
    }

    alert('框选查询已开启：第一次单击确定矩形起点，移动鼠标预览范围，第二次单击确认查询。');

    // 第一次单击：确定起点；第二次单击：确认范围
    boxSelectClickKey = map.on('singleclick', function(evt) {
        const currentCoord = evt.coordinate;

        // 第一次点击：记录起点
        if (!boxSelectStartCoord) {
            boxSelectStartCoord = currentCoord;

            // 创建一个临时矩形要素
            boxSelectFeature = new ol.Feature({
                geometry: new ol.geom.Polygon([])
            });

            boxSelectFeature.setProperties({
                type: 'box_select',
                createdAt: new Date().toISOString()
            });

            boxSelectFeature.setStyle(new ol.style.Style({
                fill: new ol.style.Fill({
                    color: 'rgba(0, 123, 255, 0.15)'
                }),
                stroke: new ol.style.Stroke({
                    color: '#007bff',
                    width: 3,
                    lineDash: [8, 6]
                })
            }));

            drawSource.addFeature(boxSelectFeature);

            return;
        }

        // 第二次点击：确认矩形范围
        const extent = ol.extent.boundingExtent([
            boxSelectStartCoord,
            currentCoord
        ]);

        // 如果点击范围太小，提示重新选择
        const width = ol.extent.getWidth(extent);
        const height = ol.extent.getHeight(extent);

        if (width === 0 || height === 0) {
            alert('框选范围太小，请重新点击选择范围。');
            clearBoxSelectListeners();

            if (boxSelectFeature) {
                drawSource.removeFeature(boxSelectFeature);
                boxSelectFeature = null;
            }

            return;
        }

        // 生成最终矩形
        const finalPolygon = ol.geom.Polygon.fromExtent(extent);

        if (boxSelectFeature) {
            boxSelectFeature.setGeometry(finalPolygon);
        }

        // 查询矩形范围内的景点
        const results = [];

        attractionsSource.getFeatures().forEach(function(feature) {
            const geometry = feature.getGeometry();

            if (!geometry) {
                return;
            }

            const coord = geometry.getCoordinates();

            if (ol.extent.containsCoordinate(extent, coord)) {
                results.push(feature);
            }
        });

        // 显示查询结果
        showSpatialQueryResult('框选查询结果', results);

        // 清除事件监听，但保留矩形框显示在地图上
        clearBoxSelectListeners();

        alert('框选查询完成，共查询到 ' + results.length + ' 个景点。');
    

    });

    // 鼠标移动时动态更新矩形预览
    boxSelectMoveKey = map.on('pointermove', function(evt) {
        if (!boxSelectStartCoord || !boxSelectFeature) {
            return;
        }

        const currentCoord = evt.coordinate;

        const extent = ol.extent.boundingExtent([
            boxSelectStartCoord,
            currentCoord
        ]);

        const previewPolygon = ol.geom.Polygon.fromExtent(extent);
        boxSelectFeature.setGeometry(previewPolygon);
    });
}

ol.interaction.DragCircle = class extends ol.interaction.Pointer {
    constructor(options) {
        super(options);
        this.source = options.source;
        this.set('active', true);
    }
    
    handleDownEvent(evt) {
        this.start = evt.coordinate;
        return true;
    }
    
    handleUpEvent(evt) {
        if (this.start) {
            const end = evt.coordinate;
            const center = this.start;
            const radius = Math.sqrt(
                Math.pow(end[0] - center[0], 2) + 
                Math.pow(end[1] - center[1], 2)
            ) * 111320;
            
            const features = this.source.getFeatures();
            const selected = features.filter(f => {
                const geom = f.getGeometry();
                if (geom.getType() === 'Point') {
                    const coords = geom.getCoordinates();
                    const dist = Math.sqrt(
                        Math.pow(coords[0] - center[0], 2) + 
                        Math.pow(coords[1] - center[1], 2)
                    ) * 111320;
                    return dist <= radius;
                }
                return false;
            });
            
            displayFeatureInfo(selected);
            this.start = null;
        }
        return false;
    }
};

function displayFeatureInfo(features) {
    const infoDiv = document.getElementById('featureInfo');
    if (features.length === 0) {
        infoDiv.innerHTML = '<p class="text-muted">' + t('infoPanel.noFeature') + '</p>';
        return;
    }
    
    let selectedText = t('attractions.selectedFeatures').replace('{count}', features.length);
    let html = `<p class="mb-2">${selectedText}:</p>`;
    features.forEach((f, i) => {
        const props = f.getProperties();
        const name = getTranslatedProperty(props, 'name') || t('infoPanel.unnamed');
        const desc = getTranslatedProperty(props, 'description');
        const category = getTranslatedProperty(props, 'category');
        
        html += `<div class="mb-2 p-2 bg-light rounded">
            <strong>${i + 1}. ${name}</strong>
            ${category ? `<br><small class="text-muted">${t('attractions.type')}: ${category}</small>` : ''}
            ${desc ? `<br><small>${desc}</small>` : ''}
        </div>`;
    });
    
    infoDiv.innerHTML = html;
}

map.on('click', function(evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
    currentSelectedFeature = feature;
    window.currentSelectedFeature = feature;
    if (feature) {
        const props = feature.getProperties();
        const geom = feature.getGeometry();
        const coords = geom.getCoordinates();
        
        currentAttractionData = {
            name: props.name,
            description: props.description,
            category: props.category,
            address: props.address,
            rating: props.rating,
            history: props.history,
            poetry: props.poetry,
            coordinates: JSON.stringify(coords)
        };
        
        if (props.name) {
            map.getView().animate({
                center: coords,
                zoom: 15,
                duration: 500
            });
        }
        
        let html = '<div class="popup-content">';
        
        if (props.name) {
            const attractionId = props.name;
            const attractionName = getTranslatedProperty(props, 'name');
            html += `<div style="display: flex; justify-content: space-between; align-items: center;">
                <h4 style="margin: 0;">${attractionName}</h4>
                <button id="favoriteBtn" class="btn btn-sm" style="padding: 4px 12px; font-size: 0.8rem;" onclick="toggleFavorite('${attractionId.replace(/'/g, "\\'")}')">
                    ⭐ ${t('attractions.favorite')}
                </button>
            </div>`;
            checkFavoriteStatus(attractionId);
        }
        
        const displayProps = ['description', 'category', 'address', 'rating', 'history', 'poetry'];
        displayProps.forEach(key => {
            const translatedValue = getTranslatedProperty(props, key);
            if (translatedValue) {
                if (key === 'rating') {
                    html += `<p><span class="label">${t('attractions.rating')}:</span> ${'★'.repeat(translatedValue)}</p>`;
                } else if (key === 'poetry') {
                    html += `<div class="poetry-section"><p><span class="label">📜 ${t('attractions.relatedPoetry')}:</span></p><pre style="white-space: pre-wrap; font-family: 'Noto Serif SC', serif; font-size: 0.85rem; color: #5c3d2e; background: rgba(201, 162, 39, 0.1); padding: 10px; border-radius: 4px; border-left: 3px solid #c9a227;">${translatedValue}</pre></div>`;
                } else if (key === 'history') {
                    html += `<p><span class="label">📖 ${t('attractions.history')}:</span></p><p style="text-indent: 2em; line-height: 1.7;">${translatedValue}</p>`;
                } else {
                    html += `<p><span class="label">${getLabel(key)}:</span> ${translatedValue}</p>`;
                }
            }
        });
        
        html += '</div>';
        document.getElementById('featureInfo').innerHTML = html;
        document.getElementById('featureInfo').style.display = 'block';
        
        if (props.name) {
    if (typeof window.showCleanAmapWeatherForFeature === 'function') {
        window.showCleanAmapWeatherForFeature(feature);
    }

    loadReviews(props.name, coords);
}
    }
});

function getLabel(key) {
    const labelMap = {
        description: t('attractions.description'),
        category: t('attractions.category'),
        address: t('attractions.address'),
        rating: t('attractions.rating'),
        name: t('attractions.name'),
        coordinates: t('attractions.coordinates'),
        history: t('attractions.historyLabel')
    };
    return labelMap[key] || key;
}

let trackDrawInteraction = null;
let currentTrackPoints = [];

function startTrackDraw() {
    // 再次点击“模拟轨迹”时，先清除上一次地图上留下的轨迹
    if (trackAnimation) {
        cancelAnimationFrame(trackAnimation);
        trackAnimation = null;
    }

    if (typeof trackSource !== 'undefined' && trackSource) {
        trackSource.clear();
    }

    if (typeof trackMarkerSource !== 'undefined' && trackMarkerSource) {
        trackMarkerSource.clear();
    }

    currentTrackPoints = [];

    // 防止路线规划的路况图层残留
    if (typeof window.clearAmapTrafficRoute === 'function') {
        window.clearAmapTrafficRoute();
    }
    if (trackDrawInteraction) {
        map.removeInteraction(trackDrawInteraction);
        trackDrawInteraction = null;
    }
    if (trackAnimation) {
        cancelAnimationFrame(trackAnimation);
        trackAnimation = null;
    }
    if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
    }
    if (selectInteraction) {
        map.removeInteraction(selectInteraction);
        selectInteraction = null;
    }
    
    populateTrackModal();
    
    const trackModal = new bootstrap.Modal(document.getElementById('trackModal'));
    trackModal.show();
}

function populateTrackModal() {
    const originSelect = document.getElementById('trackOrigin');
    const waypointsSelect = document.getElementById('trackWaypoints');
    const destinationSelect = document.getElementById('trackDestination');
    
    const originDefault = typeof t === 'function' ? t('track.selectStart') : '-- 请选择起点 --';
    const destDefault = typeof t === 'function' ? t('track.selectEnd') : '-- 请选择终点 --';
    originSelect.innerHTML = `<option value="">${originDefault}</option>`;
    waypointsSelect.innerHTML = '';
    destinationSelect.innerHTML = `<option value="">${destDefault}</option>`;
    
    fetch('data/attractions.geojson')
        .then(res => res.json())
        .then(data => {
            data.features.forEach(f => {
                const props = f.properties;
                const coords = JSON.stringify(f.geometry.coordinates);
                const translatedName = getGeoJSONFeatureName(props);
                const translatedCategory = getGeoJSONFeatureCategory(props);
                const label = `${translatedName} (${translatedCategory || '景点'})`;
                
                const originOption = document.createElement('option');
                originOption.value = coords;
                originOption.textContent = label;
                originSelect.appendChild(originOption);
                
                const waypointOption = document.createElement('option');
                waypointOption.value = coords;
                waypointOption.textContent = label;
                waypointsSelect.appendChild(waypointOption);
                
                const destOption = document.createElement('option');
                destOption.value = coords;
                destOption.textContent = label;
                destinationSelect.appendChild(destOption);
            });
            
            originSelect.addEventListener('change', updateTrackSelectedInfo);
            waypointsSelect.addEventListener('change', updateTrackSelectedInfo);
            destinationSelect.addEventListener('change', updateTrackSelectedInfo);
        })
        .catch(err => console.error('加载景点列表失败:', err));
}

function updateTrackSelectedInfo() {
    const originSelect = document.getElementById('trackOrigin');
    const waypointsSelect = document.getElementById('trackWaypoints');
    const destinationSelect = document.getElementById('trackDestination');
    const infoDiv = document.getElementById('trackSelectedInfo');
    
    const originName = originSelect.options[originSelect.selectedIndex]?.text || '';
    const destName = destinationSelect.options[destinationSelect.selectedIndex]?.text || '';
    
    const selectedWaypoints = Array.from(waypointsSelect.selectedOptions).map(opt => opt.text);
    
    let info = '';
    if (originName) info += `起点: ${originName}<br>`;
    if (selectedWaypoints.length > 0) info += `途经点: ${selectedWaypoints.join(' → ')}<br>`;
    if (destName) info += `终点: ${destName}`;
    
    if (info) {
        infoDiv.innerHTML = info;
        infoDiv.style.display = 'block';
    } else {
        infoDiv.style.display = 'none';
    }
}

function confirmTrackSelection() {
    currentTrackPoints = [];

    if (typeof trackSource !== 'undefined' && trackSource) {
        trackSource.clear();
    }

    if (typeof trackMarkerSource !== 'undefined' && trackMarkerSource) {
        trackMarkerSource.clear();
    }

    // 关键：模拟轨迹不要显示路线规划的彩色路况层和路口步骤
    if (typeof window.clearAmapTrafficRoute === 'function') {
        window.clearAmapTrafficRoute();
    }

    const originSelect = document.getElementById('trackOrigin');
    const waypointsSelect = document.getElementById('trackWaypoints');
    const destinationSelect = document.getElementById('trackDestination');

    const originValue = originSelect.value;
    const destValue = destinationSelect.value;

    if (!originValue) {
        alert('请选择起点！');
        return;
    }

    if (!destValue) {
        alert('请选择终点！');
        return;
    }

    const originCoords = JSON.parse(originValue);
    const destCoords = JSON.parse(destValue);

    const waypointValues = Array.from(waypointsSelect.selectedOptions)
        .map(function(opt) {
            return JSON.parse(opt.value);
        });

    const allPoints = [originCoords].concat(waypointValues).concat([destCoords]);

    if (allPoints.length < 2) {
        alert('轨迹点不足，至少需要起点和终点。');
        return;
    }

    // 生成模拟轨迹点：不调用 /api/route，不触发路线规划
    function createSimulatedTrackPoints(points) {
        const result = [];

        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];

            const dx = end[0] - start[0];
            const dy = end[1] - start[1];

            const distance = Math.sqrt(dx * dx + dy * dy);
            const stepCount = Math.max(25, Math.min(100, Math.ceil(distance * 80)));

            for (let j = 0; j <= stepCount; j++) {
                if (i > 0 && j === 0) {
                    continue;
                }

                const t = j / stepCount;

                const lon = start[0] + dx * t;
                const lat = start[1] + dy * t;

                result.push([
                    Number(lon.toFixed(6)),
                    Number(lat.toFixed(6))
                ]);
            }
        }

        return result;
    }

    const routeCoords = createSimulatedTrackPoints(allPoints);

    if (routeCoords.length < 2) {
        alert('模拟轨迹生成失败。');
        return;
    }

    currentTrackPoints = routeCoords;

    // 画轨迹线
    const lineFeature = new ol.Feature({
        geometry: new ol.geom.LineString(routeCoords)
    });

    lineFeature.setProperties({
        type: 'simulated_track',
        name: '模拟轨迹'
    });

    lineFeature.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#e91e63',
            width: 4,
            lineDash: [10, 6]
        })
    }));

    trackSource.addFeature(lineFeature);

    // 起点
    const originMarker = new ol.Feature({
        geometry: new ol.geom.Point(originCoords)
    });

    originMarker.setStyle(new ol.style.Style({
        image: new ol.style.Icon({
            src: 'data:image/svg+xml;utf8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4CAF50" width="32" height="32"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'
            ),
            anchor: [0.5, 1]
        })
    }));

    trackMarkerSource.addFeature(originMarker);

    // 途经点
    waypointValues.forEach(function(wp, index) {
        const wpMarker = new ol.Feature({
            geometry: new ol.geom.Point(wp)
        });

        wpMarker.setStyle(new ol.style.Style({
            image: new ol.style.Icon({
                src: 'data:image/svg+xml;utf8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF9800" width="28" height="28"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'
                ),
                anchor: [0.5, 1]
            }),
            text: new ol.style.Text({
                text: String(index + 1),
                font: 'bold 12px Arial',
                fill: new ol.style.Fill({
                    color: '#ffffff'
                }),
                stroke: new ol.style.Stroke({
                    color: '#FF9800',
                    width: 3
                }),
                offsetY: -20
            })
        }));

        trackMarkerSource.addFeature(wpMarker);
    });

    // 终点
    const destMarker = new ol.Feature({
        geometry: new ol.geom.Point(destCoords)
    });

    destMarker.setStyle(new ol.style.Style({
        image: new ol.style.Icon({
            src: 'data:image/svg+xml;utf8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F44336" width="32" height="32"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'
            ),
            anchor: [0.5, 1]
        })
    }));

    trackMarkerSource.addFeature(destMarker);

    const extent = trackSource.getExtent();

    if (!ol.extent.isEmpty(extent)) {
        map.getView().fit(extent, {
            padding: [80, 420, 80, 80],
            duration: 500,
            maxZoom: 10
        });
    }

    const trackModalEl = document.getElementById('trackModal');
    const trackModal = bootstrap.Modal.getInstance(trackModalEl);

    if (trackModal) {
        trackModal.hide();
    }

    const originName = originSelect.options[originSelect.selectedIndex]?.text || '起点';
    const destName = destinationSelect.options[destinationSelect.selectedIndex]?.text || '终点';

    const autoTrackName = originName + ' → ' + destName;

    savedTracks.push({
    name: autoTrackName,
    points: routeCoords
});

alert('模拟轨迹已绘制完成。如需播放，请点击“播放轨迹”或“轨迹回放”。');
}
function playTrack() {
    if (savedTracks.length === 0) {
        alert('没有已保存的轨迹');
        return;
    }
    
    selectedTrackIndex = null;
    document.getElementById('trackActionButtons').style.display = 'none';
    
    let html = '<div class="list-group">';
    savedTracks.forEach((t, i) => {
        html += `<button type="button" class="list-group-item list-group-item-action" onclick="selectTrack(${i})">${i + 1}. ${t.name}</button>`;
    });
    html += '</div>';
    
    document.getElementById('trackListContent').innerHTML = html;
    const trackListModal = new bootstrap.Modal(document.getElementById('trackListModal'));
    trackListModal.show();
}

function selectTrack(index) {
    selectedTrackIndex = index;
    const track = savedTracks[index];
    
    document.querySelectorAll('#trackListContent .list-group-item').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('#trackListContent .list-group-item')[index].classList.add('active');
    
    document.getElementById('selectedTrackName').textContent = `已选择: ${track.name}`;
    document.getElementById('trackActionButtons').style.display = 'block';
}

function playSelectedTrack() {
    if (selectedTrackIndex === null) {
        alert('请先选择一个轨迹');
        return;
    }
    
    const trackListModal = bootstrap.Modal.getInstance(document.getElementById('trackListModal'));
    if (trackListModal) trackListModal.hide();
    
    const track = savedTracks[selectedTrackIndex];
    playTrackAnimation(track.points);
}

function deleteSelectedTrack() {
    if (selectedTrackIndex === null) {
        alert('请先选择一个轨迹');
        return;
    }
    
    const track = savedTracks[selectedTrackIndex];
    if (confirm(`确定要删除轨迹 "${track.name}" 吗？`)) {
        savedTracks.splice(selectedTrackIndex, 1);
        alert('轨迹已删除');
        
        const trackListModal = bootstrap.Modal.getInstance(document.getElementById('trackListModal'));
        if (trackListModal) trackListModal.hide();
        
        if (savedTracks.length > 0) {
            playTrack();
        }
    }
}

function playTrackAnimation(points) {
    if (!points || points.length < 2) {
        alert('轨迹点不足');
        return;
    }
    
    if (trackAnimation) {
        cancelAnimationFrame(trackAnimation);
    }
    
    trackMarkerSource.clear();
    
    let currentIndex = 0;
    let progress = 0;
    const speed = 5;    
    function animate() {
        if (currentIndex >= points.length - 1) {
            return;
        }
        
        const startPoint = points[currentIndex];
        const endPoint = points[currentIndex + 1];
        
        progress += speed;
        
        if (progress >= 1) {
            progress = 0;
            currentIndex++;
            
            if (currentIndex >= points.length - 1) {
                return;
            }
        }
        
        const currentX = startPoint[0] + (endPoint[0] - startPoint[0]) * progress;
        const currentY = startPoint[1] + (endPoint[1] - startPoint[1]) * progress;
        
        trackMarkerSource.clear();
        
        const markerFeature = new ol.Feature({
            geometry: new ol.geom.Point([currentX, currentY])
        });
        trackMarkerSource.addFeature(markerFeature);
        
        trackAnimation = requestAnimationFrame(animate);
    }
    
    const startMarker = new ol.Feature({
        geometry: new ol.geom.Point(points[0])
    });
    trackMarkerSource.addFeature(startMarker);
    
    animate();
}

function stopTrackAnimation() {
    if (trackAnimation) {
        cancelAnimationFrame(trackAnimation);
        trackAnimation = null;
    }
    trackMarkerSource.clear();
}

// 根据文件扩展名获取对应的数据格式
function getGISFormatByFileName(fileName) {
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.kml')) {
        return {
            type: 'kml',
            format: new ol.format.KML({
                extractStyles: false
            })
        };
    }

    if (lowerName.endsWith('.gpx')) {
        return {
            type: 'gpx',
            format: new ol.format.GPX()
        };
    }

    return {
        type: 'geojson',
        format: new ol.format.GeoJSON()
    };
}

// 导入 GeoJSON / KML / GPX 数据
function importGISData() {
    const fileInput = document.getElementById('geojsonFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('请选择要导入的文件');
        return;
    }

    const formatInfo = getGISFormatByFileName(file.name);
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const text = e.target.result;
            const projection = map.getView().getProjection();

            const features = formatInfo.format.readFeatures(text, {
                dataProjection: 'EPSG:4326',
                featureProjection: projection
            });

            if (!features || features.length === 0) {
                alert('文件已读取，但没有解析到有效要素。');
                return;
            }

            drawSource.addFeatures(features);

            const extent = drawSource.getExtent();

            if (!ol.extent.isEmpty(extent)) {
                map.getView().fit(extent, {
                    padding: [80, 420, 80, 80],
                    duration: 800,
                    maxZoom: 12
                });
            }

            alert('成功导入 ' + features.length + ' 个要素，文件类型：' + formatInfo.type.toUpperCase());

            const modal = bootstrap.Modal.getInstance(document.getElementById('importModal'));
            if (modal) {
                modal.hide();
            }

            fileInput.value = '';
        } catch (err) {
            console.error(err);
            alert('文件导入失败：' + err.message);
        }
    };

    reader.readAsText(file);
}

// 根据文件扩展名判断导入格式
function getGISFormatByFileName(fileName) {
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.kml')) {
        return {
            type: 'kml',
            format: new ol.format.KML({
                extractStyles: false
            })
        };
    }

    if (lowerName.endsWith('.gpx')) {
        return {
            type: 'gpx',
            format: new ol.format.GPX()
        };
    }

    return {
        type: 'geojson',
        format: new ol.format.GeoJSON()
    };
}

// 导入 GeoJSON / KML / GPX 数据
function importGISData() {
    const fileInput = document.getElementById('geojsonFile');

    if (!fileInput) {
        alert('没有找到文件选择框 geojsonFile，请检查 index.html 中 input 的 id。');
        return;
    }

    const file = fileInput.files[0];

    if (!file) {
        alert('请选择要导入的文件。');
        return;
    }

    const formatInfo = getGISFormatByFileName(file.name);
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const text = e.target.result;

            const features = formatInfo.format.readFeatures(text, {
                dataProjection: 'EPSG:4326',
                featureProjection: map.getView().getProjection()
            });

            if (!features || features.length === 0) {
                alert('文件已读取，但没有解析到有效要素。请检查文件内容是否正确。');
                return;
            }

            // 导入的数据放到绘制图层中显示
            drawSource.addFeatures(features);

            // 缩放到导入数据范围
            const extent = ol.extent.createEmpty();

            features.forEach(function(feature) {
                const geometry = feature.getGeometry();

                if (geometry) {
                    ol.extent.extend(extent, geometry.getExtent());
                }
            });

            if (!ol.extent.isEmpty(extent)) {
                map.getView().fit(extent, {
                    padding: [80, 420, 80, 80],
                    duration: 800,
                    maxZoom: 12
                });
            }

            alert('导入成功：' + features.length + ' 个要素，格式：' + formatInfo.type.toUpperCase());

            // 关闭弹窗
            const modalElement = document.getElementById('importModal');
            const modal = bootstrap.Modal.getInstance(modalElement);

            if (modal) {
                modal.hide();
            }

            // 清空文件选择框，方便下次重新导入
            fileInput.value = '';
        } catch (err) {
            console.error(err);
            alert('导入失败：' + err.message);
        }
    };

    reader.onerror = function() {
        alert('文件读取失败，请重新选择文件。');
    };

    reader.readAsText(file);
}

// 兼容旧按钮：如果页面里还有 importGeoJSON()，也能正常导入
function importGeoJSON() {
    importGISData();
}

// 导出前处理要素
// 注意：GeoJSON/KML/GPX 不支持 OpenLayers 的 Circle 几何，所以圆会转成多边形导出
function prepareFeaturesForExport(formatType) {
    const attractionsFeatures = attractionsSource.getFeatures();
    const drawFeatures = drawSource.getFeatures();

    const allFeatures = [...attractionsFeatures, ...drawFeatures];

    const exportFeatures = [];

    allFeatures.forEach(function(feature) {
        const cloneFeature = feature.clone();
        const geometry = cloneFeature.getGeometry();

        if (!geometry) {
            return;
        }

        // Circle 转 Polygon，避免导出失败
        if (geometry.getType && geometry.getType() === 'Circle') {
            cloneFeature.setGeometry(ol.geom.Polygon.fromCircle(geometry, 96));
        }

        const newGeometry = cloneFeature.getGeometry();
        const geometryType = newGeometry.getType();

        // GPX 主要适合点和线，不适合面
        // 所以导出 GPX 时只保留 Point / LineString / MultiLineString
        if (formatType === 'gpx') {
            if (
                geometryType === 'Point' ||
                geometryType === 'MultiPoint' ||
                geometryType === 'LineString' ||
                geometryType === 'MultiLineString'
            ) {
                exportFeatures.push(cloneFeature);
            }
        } else {
            exportFeatures.push(cloneFeature);
        }
    });

    return exportFeatures;
}

// 导出 GeoJSON / KML / GPX 数据
function exportGISData(formatType) {
    const exportFeatures = prepareFeaturesForExport(formatType);

    if (exportFeatures.length === 0) {
        alert('没有可导出的要素。注意：GPX 格式主要支持点和线，如果当前只有面要素，可能无法导出。');
        return;
    }

    let format;
    let fileName;
    let mimeType;

    const projection = map.getView().getProjection();

    if (formatType === 'kml') {
        format = new ol.format.KML();
        fileName = 'export.kml';
        mimeType = 'application/vnd.google-earth.kml+xml';
    } else if (formatType === 'gpx') {
        format = new ol.format.GPX();
        fileName = 'export.gpx';
        mimeType = 'application/gpx+xml';
    } else {
        format = new ol.format.GeoJSON();
        fileName = 'export.geojson';
        mimeType = 'application/json';
    }

    try {
        const data = format.writeFeatures(exportFeatures, {
            dataProjection: 'EPSG:4326',
            featureProjection: projection
        });

        const blob = new Blob([data], {
            type: mimeType
        });

        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();

        URL.revokeObjectURL(url);

        alert('成功导出 ' + exportFeatures.length + ' 个要素，格式：' + formatType.toUpperCase());
    } catch (err) {
        console.error(err);
        alert('导出失败：' + err.message);
    }
}

// 兼容旧按钮：如果页面里还有 exportGeoJSON()，也不会报错
function exportGeoJSON() {
    exportGISData('geojson');
}
function showMapTools() {
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    navLinks.forEach(link => {
        if (link.textContent.trim() === '地图工具') {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    hideAttractions();
    
    const toolbar = document.getElementById('toolbar');
    toolbar.classList.add('show');
}

function showAttractions() {
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    navLinks.forEach(link => {
        if (link.textContent.trim() === '景点展示') {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    const toolbar = document.getElementById('toolbar');
    toolbar.classList.remove('show');
    
    fetch('data/attractions.geojson')
        .then(res => res.json())
        .then(data => {
            attractionsSource.clear();
            const features = new ol.format.GeoJSON().readFeatures(data);
            attractionsSource.addFeatures(features);
            
            const content = document.getElementById('attractionsContent');
            let html = '';
            
            data.features.forEach(f => {
                const props = f.properties;
                html += `<div class="attraction-item" onclick="focusAttraction([${f.geometry.coordinates}])">
                    <h6>${getTranslatedProperty(props, 'name')}</h6>
                    <p>${getTranslatedProperty(props, 'description')}</p>
                </div>`;
            });
            
            content.innerHTML = html;
            document.getElementById('attractionsList').style.display = 'block';
            
            const extent = attractionsSource.getExtent();
            map.getView().fit(extent, { padding: [50, 50, 50, 50] });
        })
        .catch(err => console.error('加载景点数据失败:', err));
}

function hideAttractions() {
    document.getElementById('attractionsList').style.display = 'none';
}

function focusAttraction(coords) {
    map.getView().animate({
        center: coords,
        zoom: 15,
        duration: 500
    });
    
    const features = attractionsSource.getFeatures();
    const feature = features.find(f => {
        const g = f.getGeometry();
        return g.getCoordinates()[0] === coords[0] && g.getCoordinates()[1] === coords[1];
    });
    
    if (feature) {
        const props = feature.getProperties();
        
        currentAttractionData = {
            name: props.name,
            description: props.description,
            category: props.category,
            address: props.address,
            rating: props.rating,
            history: props.history,
            poetry: props.poetry,
            coordinates: JSON.stringify(coords)
        };
        
        let html = '<div class="popup-content">';
        
        const attractionId = props.name;
        html += `<div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="margin: 0;">${getTranslatedProperty(props, 'name')}</h4>
            <button id="favoriteBtn" class="btn btn-sm" style="padding: 4px 12px; font-size: 0.8rem;" onclick="toggleFavorite('${attractionId.replace(/'/g, "\\'")}')">
                ⭐ ${t('attractions.favorite')}
            </button>
        </div>`;
        checkFavoriteStatus(attractionId);
        
        const displayProps = ['description', 'category', 'address', 'rating', 'history', 'poetry'];
        displayProps.forEach(key => {
            const translatedValue = getTranslatedProperty(props, key);
            if (translatedValue) {
                if (key === 'rating') {
                    html += `<p><span class="label">${t('attractions.rating')}:</span> ${'★'.repeat(translatedValue)}</p>`;
                } else if (key === 'poetry') {
                    html += `<div class="poetry-section"><p><span class="label">📜 ${t('attractions.relatedPoetry')}:</span></p><pre style="white-space: pre-wrap; font-family: 'Noto Serif SC', serif; font-size: 0.85rem; color: #5c3d2e; background: rgba(201, 162, 39, 0.1); padding: 10px; border-radius: 4px; border-left: 3px solid #c9a227;">${translatedValue}</pre></div>`;
                } else if (key === 'history') {
                    html += `<p><span class="label">📖 ${t('attractions.history')}:</span></p><p style="text-indent: 2em; line-height: 1.7;">${translatedValue}</p>`;
                } else {
                    html += `<p><span class="label">${getLabel(key)}:</span> ${translatedValue}</p>`;
                }
            }
        });
        
        html += '</div>';
        
        document.getElementById('featureInfo').innerHTML = html;
document.getElementById('featureInfo').style.display = 'block';
        loadWeather(coords[0], coords[1]);
        queryAirQuality(coords[0], coords[1], props.name);
        loadReviews(props.name, coords);
        startRealTimeUpdate(coords[0], coords[1], props.name);
    }
}

function queryAttraction(id) {
    if (!id) {
        const extent = attractionsSource.getExtent();
        map.getView().fit(extent, { 
            padding: [50, 50, 50, 50],
            duration: 500
        });
        return;
    }
    
    const features = attractionsSource.getFeatures();
    const feature = features.find(f => f.get('id') === id);
    
    if (feature) {
        const geom = feature.getGeometry();
        const coords = geom.getCoordinates();
        
        map.getView().animate({
            center: coords,
            zoom: 15,
            duration: 500
        });
        
        const props = feature.getProperties();
        
        currentAttractionData = {
            name: props.name,
            description: props.description,
            category: props.category,
            address: props.address,
            rating: props.rating,
            history: props.history,
            poetry: props.poetry,
            coordinates: JSON.stringify(coords)
        };
        
        let html = '<div class="popup-content">';
        
        const attractionId = props.name;
        html += `<div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="margin: 0;">${props.name}</h4>
            <button id="favoriteBtn" class="btn btn-sm" style="padding: 4px 12px; font-size: 0.8rem;" onclick="toggleFavorite('${attractionId.replace(/'/g, "\\'")}')">
                ⭐ 收藏
            </button>
        </div>`;
        checkFavoriteStatus(attractionId);
        updateFavoriteButton(attractionId);
        
        const displayProps = ['description', 'category', 'address', 'rating', 'history', 'poetry'];
        displayProps.forEach(key => {
            if (props[key]) {
                if (key === 'rating') {
                    html += `<p><span class="label">评分:</span> ${'★'.repeat(props[key])}</p>`;
                } else if (key === 'poetry') {
                    html += `<div class="poetry-section"><p><span class="label">📜 相关诗词:</span></p><pre style="white-space: pre-wrap; font-family: 'Noto Serif SC', serif; font-size: 0.85rem; color: #5c3d2e; background: rgba(201, 162, 39, 0.1); padding: 10px; border-radius: 4px; border-left: 3px solid #c9a227;">${props[key]}</pre></div>`;
                } else if (key === 'history') {
                    html += `<p><span class="label">📖 历史沿革:</span></p><p style="text-indent: 2em; line-height: 1.7;">${props[key]}</p>`;
                } else {
                    html += `<p><span class="label">${getLabel(key)}:</span> ${props[key]}</p>`;
                }
            }
        });
        
        html += '</div>';
        
        document.getElementById('featureInfo').innerHTML = html;
document.getElementById('featureInfo').style.display = 'block';
        loadWeather(coords[0], coords[1]);
        queryAirQuality(coords[0], coords[1], props.name);
        loadReviews(props.name, coords);
        startRealTimeUpdate(coords[0], coords[1], props.name);
    }
}

const popup = new ol.Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-auto',
    offset: [0, -10]
});
popup.getElement().className = 'ol-popup';
map.addOverlay(popup);

map.on('pointermove', function(evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
    
    if (feature && feature.get('name')) {
        map.getTargetElement().style.cursor = 'pointer';
    } else {
        map.getTargetElement().style.cursor = '';
    }
});

function queryAirQuality(lon, lat, name) {
    window.lastAirQualityParams = { lon, lat, name };
    const resultDiv = document.getElementById('airQualityResult');
    const tLoading = typeof t === 'function' ? t('weather.loading') : '正在分析空气质量...';
    resultDiv.innerHTML = `<div class="air-quality-loading"><span class="spinner-border spinner-border-sm"></span> ${tLoading}</div>`;
    
    fetch(`/api/airquality?lon=${lon}&lat=${lat}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                const tError = typeof t === 'function' ? t('weather.queryFailed') : '查询失败，请稍后重试';
                resultDiv.innerHTML = `<div class="alert alert-danger">${data.error || tError}</div>`;
                return;
            }
            
            const aqiColor = data.color;
            const aqiTextColor = data.aqi > 100 ? '#fff' : '#333';
            const tAirQuality = typeof t === 'function' ? t('weather.airQuality') : '空气质量';
            const tCrowd = typeof t === 'function' ? t('weather.crowd') : '人流量';
            const tPm25 = typeof t === 'function' ? t('weather.pm25') : 'PM2.5';
            const tPm10 = typeof t === 'function' ? t('weather.pm10') : 'PM10';
            const tSo2 = typeof t === 'function' ? t('weather.so2') : 'SO₂';
            const tNo2 = typeof t === 'function' ? t('weather.no2') : 'NO₂';
            const tCo = typeof t === 'function' ? t('weather.co') : 'CO';
            const tO3 = typeof t === 'function' ? t('weather.o3') : 'O₃';
            const tUpdatedTime = typeof t === 'function' ? t('weather.updatedTime') : '数据更新时间';
            
            // Translate the data from server
            function translateLevel(level) {
                if (typeof t !== 'function') return level;
                const levelMap = {
                    '优': t('weather.excellent'),
                    '良': t('weather.good'),
                    '轻度污染': t('weather.moderate'),
                    '中度污染': t('weather.unhealthful'),
                    '重度污染': t('weather.veryUnhealthy'),
                    '严重污染': t('weather.hazardous')
                };
                return levelMap[level] || level;
            }
            
            function translateAdvice(level) {
                if (typeof t !== 'function') return level;
                const adviceMap = {
                    '优': t('weather.adviceExcellent'),
                    '良': t('weather.adviceGood'),
                    '轻度污染': t('weather.adviceModerate'),
                    '中度污染': t('weather.adviceUnhealthful'),
                    '重度污染': t('weather.adviceVeryUnhealthy'),
                    '严重污染': t('weather.adviceHazardous')
                };
                // Try to match based on keywords
                if (typeof level === 'string') {
                    if (level.includes('优') || level.includes('良好')) return t('weather.adviceExcellent');
                    if (level.includes('良') || level.includes('可接受')) return t('weather.adviceGood');
                    if (level.includes('轻度') || level.includes('敏感')) return t('weather.adviceModerate');
                    if (level.includes('中度') || level.includes('所有人')) return t('weather.adviceUnhealthful');
                    if (level.includes('重度') || level.includes('避免')) return t('weather.adviceVeryUnhealthy');
                    if (level.includes('严重') || level.includes('不建议')) return t('weather.adviceHazardous');
                }
                return data.advice;
            }
            
            function translatePollutant(pollutant) {
                if (pollutant === '无') {
                    return typeof t === 'function' ? t('weather.none') : 'None';
                }
                return pollutant;
            }
            
            function translateCrowdStatus(status) {
                if (typeof t !== 'function') return status;
                const crowdMap = {
                    '舒适': t('weather.crowdComfortable'),
                    '适中': t('weather.crowdModerate'),
                    '拥挤': t('weather.crowdCrowded'),
                    '爆满': t('weather.crowdFull')
                };
                return crowdMap[status] || status;
            }
            
            function translateCrowdAdvice(advice) {
                if (typeof t !== 'function') return advice;
                if (advice.includes('较少') || advice.includes('适合')) return t('weather.crowdAdviceComfortable');
                if (advice.includes('一般') || advice.includes('适宜')) return t('weather.crowdAdviceModerate');
                if (advice.includes('较多') || advice.includes('错峰')) return t('weather.crowdAdviceCrowded');
                if (advice.includes('极大') || advice.includes('不建议')) return t('weather.crowdAdviceFull');
                return advice;
            }
            
            const translatedLevel = translateLevel(data.level);
            const translatedAdvice = typeof data.level === 'string' ? translateAdvice(data.level) : data.advice;
            const translatedPollutants = data.pollutants.map(p => translatePollutant(p));
            const translatedCrowdStatus = translateCrowdStatus(data.crowdStatus);
            const translatedCrowdAdvice = translateCrowdAdvice(data.crowdAdvice);
            
            const locale = window.currentLang === 'ja' ? 'ja-JP' : 
                          window.currentLang === 'ko' ? 'ko-KR' : 
                          window.currentLang === 'en' ? 'en-US' : 
                          window.currentLang === 'zh-TW' ? 'zh-TW' : 'zh-CN';
            
            resultDiv.innerHTML = `
                <div class="air-quality-result">
                    <div class="aqi-header" style="background: ${aqiColor}; color: ${aqiTextColor};">
                        <div>
                            <div>${name} ${tAirQuality}</div>
                            <div>AQI ${data.aqi}</div>
                        </div>
                        <div>
                            <div>${translatedLevel}</div>
                            <div>${translatedPollutants.join(', ')}</div>
                        </div>
                    </div>
                    <div class="aqi-advice" style="border-left-color: ${aqiColor};">
                        💡 ${translatedAdvice}
                    </div>
                    <div class="crowd-section" style="border-color: ${data.crowdColor};">
                        <div>
                            <div>${tCrowd}</div>
                            <div style="color: ${data.crowdColor};">${data.crowdLevel}%</div>
                        </div>
                        <div>
                            <div style="color: ${data.crowdColor};">${translatedCrowdStatus}</div>
                            <div>${translatedCrowdAdvice}</div>
                        </div>
                    </div>
                    <div class="aqi-details">
                        <div class="pollutant-item">
                            <div>${tPm25}</div>
                            <div class="${data.pm25 > 75 ? 'bad' : 'good'}">${data.pm25} μg/m³</div>
                        </div>
                        <div class="pollutant-item">
                            <div>${tPm10}</div>
                            <div class="${data.pm10 > 150 ? 'bad' : 'good'}">${data.pm10} μg/m³</div>
                        </div>
                        <div class="pollutant-item">
                            <div>${tSo2}</div>
                            <div class="${data.so2 > 60 ? 'bad' : 'good'}">${data.so2} μg/m³</div>
                        </div>
                        <div class="pollutant-item">
                            <div>${tNo2}</div>
                            <div class="${data.no2 > 80 ? 'bad' : 'good'}">${data.no2} μg/m³</div>
                        </div>
                        <div class="pollutant-item">
                            <div>${tCo}</div>
                            <div class="${data.co > 4 ? 'bad' : 'good'}">${data.co} mg/m³</div>
                        </div>
                        <div class="pollutant-item">
                            <div>${tO3}</div>
                            <div class="${data.o3 > 180 ? 'bad' : 'good'}">${data.o3} μg/m³</div>
                        </div>
                    </div>
                    <div style="font-size: 0.65rem; color: #666; text-align: right; margin-top: 6px;">
                        ${tUpdatedTime}: ${new Date(data.timestamp).toLocaleString(locale)}
                    </div>
                </div>
            `;
        })
        .catch(err => {
            console.error('空气质量查询失败:', err);
            const tQueryFailed = typeof t === 'function' ? t('weather.queryFailed') : '查询失败，请稍后重试';
            resultDiv.innerHTML = `<div class="alert alert-danger">${tQueryFailed}</div>`;
        });
}

let routeSource1 = new ol.source.Vector();
let routeLayer1 = new ol.layer.Vector({
    source: routeSource1,
    zIndex: 15
});
map.addLayer(routeLayer1);

let routeSource2 = new ol.source.Vector();
let routeLayer2 = new ol.layer.Vector({
    source: routeSource2,
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#FF9800',
            width: 4,
            lineDash: [10, 5]
        }),
        image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: '#FF9800' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
        })
    }),
    zIndex: 2
});
map.addLayer(routeLayer2);

let originMarkerSource = new ol.source.Vector();
let originMarkerLayer = new ol.layer.Vector({
    source: originMarkerSource,
    style: new ol.style.Style({
        image: new ol.style.Icon({
            src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232196F3" width="32" height="32"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
            scale: 1.2,
            anchor: [0.5, 1]
        })
    }),
    zIndex: 6
});
map.addLayer(originMarkerLayer);

let destinationMarkerSource = new ol.source.Vector();
let destinationMarkerLayer = new ol.layer.Vector({
    source: destinationMarkerSource,
    style: new ol.style.Style({
        image: new ol.style.Icon({
            src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23e74c3c" width="32" height="32"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
            scale: 1.2,
            anchor: [0.5, 1]
        })
    }),
    zIndex: 6
});
map.addLayer(destinationMarkerLayer);

let originCoords = null;

function loadReviews(name, coords) {
    const reviewsContainer = document.getElementById('featureInfo');
    if (!reviewsContainer) return;
    
    const loadingHtml = `<div class="reviews-section">
        <div class="reviews-header">
            <h5>💬 ${t('attractions.reviews')}</h5>
        </div>
        <div class="reviews-loading">${t('attractions.loadingReviews')}</div>
    </div>`;
    
    let currentHtml = reviewsContainer.innerHTML;
    if (currentHtml.indexOf('reviews-section') === -1) {
        currentHtml += loadingHtml;
        reviewsContainer.innerHTML = currentHtml;
    }
    
    const currentLang = window.currentLang || 'zh-CN';
    
    fetch(`/api/poi/detail?name=${encodeURIComponent(name)}&location=${encodeURIComponent(coords)}&lang=${encodeURIComponent(currentLang)}`)
        .then(res => res.json())
        .then(data => {
            const reviews = data.reviews || [];
            const avgRating = data.avgRating || '0';
            const total = data.total || 0;
            const source = data.source || t('basemap.gaode');
            
            let reviewsHtml = `<div class="reviews-section">
                <div class="reviews-header">
                    <h5>💬 ${t('attractions.reviews')}</h5>
                    <div class="reviews-rating">
                        <span class="score">${avgRating}</span>
                        <span class="stars">${'★'.repeat(Math.round(parseFloat(avgRating)))}</span>
                    </div>
                </div>`;
            
            if (reviews.length > 0) {
                reviews.forEach(review => {
                    reviewsHtml += `
                        <div class="review-item">
                            <div class="review-header">
                                <span class="review-user">${review.user}</span>
                                <span class="review-date">${review.date}</span>
                            </div>
                            <div class="review-rating">${'★'.repeat(review.rating)}</div>
                            <div class="review-content">${review.content}</div>
                        </div>
                    `;
                });
            } else {
                reviewsHtml += `<div class="reviews-empty">${t('attractions.noReviews')}</div>`;
            }
            
            reviewsHtml += '</div>';
            
            const container = document.getElementById('featureInfo');
            if (container) {
                const existingSection = container.querySelector('.reviews-section');
                if (existingSection) {
                    existingSection.remove();
                }
                container.innerHTML += reviewsHtml;
            }
        })
        .catch(err => {
            console.error('加载点评失败:', err);
            const container = document.getElementById('featureInfo');
            if (container) {
                const existingSection = container.querySelector('.reviews-section');
                if (existingSection) {
                    existingSection.innerHTML = `<div class="reviews-empty">${t('attractions.loadFailed')}</div>`;
                }
            }
        });
}

function populateAttractionsForRoute() {
    const destinationSelect = document.getElementById('routeDestination');
    const originSelect = document.getElementById('routeOriginSelect');
    fetch('data/attractions.geojson')
        .then(res => res.json())
        .then(data => {
            const destDefault = typeof t === 'function' ? t('route.selectDestination') : '-- 请选择目的地景点 --';
            const originDefault = typeof t === 'function' ? t('route.selectAttraction') : '选择景点';
            destinationSelect.innerHTML = `<option value="">${destDefault}</option>`;
            originSelect.innerHTML = `<option value="">${originDefault}</option>`;
            data.features.forEach(f => {
                const props = f.properties;
                const coords = JSON.stringify(f.geometry.coordinates);
                const name = getGeoJSONFeatureName(props);
                
                const destOption = document.createElement('option');
                destOption.value = coords;
                destOption.textContent = name;
                destinationSelect.appendChild(destOption);
                
                const originOption = document.createElement('option');
                originOption.value = coords;
                originOption.textContent = name;
                originSelect.appendChild(originOption);
            });
        })
        .catch(err => console.error('加载景点列表失败:', err));
}

populateAttractionsForRoute();

document.getElementById('routeOriginSelect').addEventListener('change', function(e) {
    const coordsStr = e.target.value;
    if (coordsStr) {
        const coords = JSON.parse(coordsStr);
        originCoords = coords;
        
        const markerFeature = new ol.Feature({
            geometry: new ol.geom.Point(coords)
        });
        originMarkerSource.clear();
        originMarkerSource.addFeature(markerFeature);
        
        map.getView().animate({
            center: coords,
            zoom: 15,
            duration: 500
        });
        
        const features = attractionsSource.getFeatures();
        const feature = features.find(f => {
            const g = f.getGeometry();
            return g.getCoordinates()[0] === coords[0] && g.getCoordinates()[1] === coords[1];
        });
        
        if (feature) {
            document.getElementById('routeOrigin').value = feature.getProperties().name;
        }
    } else {
        originMarkerSource.clear();
        originCoords = null;
        document.getElementById('routeOrigin').value = '';
    }
});

function planRoute() {
    const originInput = document.getElementById('routeOrigin').value.trim();
    const destinationSelect = document.getElementById('routeDestination');
    const destination = destinationSelect.value;
    const strategy = document.getElementById('routeStrategy').value;
    const resultDiv = document.getElementById('routeResult');
    
    if (!originInput) {
        alert('请先设置起点！');
        return;
    }
    
    if (!destination) {
        alert('请选择终点景点！');
        return;
    }
    
    const destCoords = JSON.parse(destination);
    
    resultDiv.innerHTML = '<div class="text-center"><span class="spinner-border spinner-border-sm"></span> 正在规划路线...</div>';
    
    let originStr;
    if (originCoords) {
        originStr = `${originCoords[0]},${originCoords[1]}`;
    } else {
        originStr = encodeURIComponent(originInput);
    }
    
    const destStr = `${destCoords[0]},${destCoords[1]}`;
    
    fetch(`/api/route?origin=${originStr}&destination=${destStr}&strategy=${strategy}&traffic=1`)
        .then(res => res.json())
        .then(data => {
            console.log('=== Route API Response ===');
            console.log('Status:', data.status);
            console.log('Has route:', !!data.route);
            console.log('Paths count:', data.route?.paths?.length || 0);
            
            if (data.route?.paths?.[0]?.steps) {
                const firstStep = data.route.paths[0].steps[0];
                console.log('First step keys:', Object.keys(firstStep));
                console.log('traffic_status:', firstStep.traffic_status);
                console.log('status:', firstStep.status);
            }
            
            if (data.status !== '1' || !data.route || !data.route.paths || data.route.paths.length === 0) {
                resultDiv.innerHTML = '<div class="alert alert-warning">未找到路线，请尝试其他策略或起点</div>';
                return;
            }
            
            const paths = data.route.paths;
            const optimalRoute = paths[0];
            const alternativeRoute = paths[1];
            
            routeSource1.clear();
            routeSource2.clear();
            destinationMarkerSource.clear();
            
            const destFeature = new ol.Feature({
                geometry: new ol.geom.Point(destCoords)
            });
            destinationMarkerSource.addFeature(destFeature);
            
            if (optimalRoute && optimalRoute.steps) {
                optimalRoute.steps.forEach((step, index) => {
                    const polyline = step.polyline;
                    const points = polyline.split(';');
                    const stepCoords = [];
                    points.forEach(p => {
                        const coords = p.split(',');
                        if (coords.length === 2) {
                            stepCoords.push([parseFloat(coords[0]), parseFloat(coords[1])]);
                        }
                    });
                    
                    if (stepCoords.length > 0) {
                        const roadName = step.road || '';
                        let trafficStatus = 0;
                        if (step.traffic_status !== undefined && step.traffic_status !== null) {
                            trafficStatus = typeof step.traffic_status === 'string' ? parseInt(step.traffic_status) : step.traffic_status;
                        } else if (step.status !== undefined && step.status !== null) {
                            trafficStatus = typeof step.status === 'string' ? parseInt(step.status) : step.status;
                        } else {
                            const isHighway = roadName && (roadName.includes('高速') || roadName.includes('G') || roadName.includes('国道'));
                            const rand = Math.random();
                            
                            if (isHighway) {
                                if (rand < 0.85) {
                                    trafficStatus = 1;
                                } else if (rand < 0.95) {
                                    trafficStatus = 2;
                                } else {
                                    trafficStatus = 3;
                                }
                            } else {
                                if (rand < 0.4) {
                                    trafficStatus = 1;
                                } else if (rand < 0.7) {
                                    trafficStatus = 2;
                                } else if (rand < 0.9) {
                                    trafficStatus = 3;
                                } else {
                                    trafficStatus = 4;
                                }
                            }
                        }
                        const trafficColor = getTrafficColor(trafficStatus);
                        
                        const lineFeature = new ol.Feature({
                            geometry: new ol.geom.LineString(stepCoords),
                            trafficStatus: trafficStatus,
                            roadName: roadName
                        });
                        
                        lineFeature.setStyle(new ol.style.Style({
                            stroke: new ol.style.Stroke({
                                color: trafficColor,
                                width: 6
                            })
                        }));
                        
                        routeSource1.addFeature(lineFeature);
                        
                        if (trafficStatus >= 1 && stepCoords.length > 3) {
                            const midIndex = Math.floor(stepCoords.length / 2);
                            const midPoint = stepCoords[midIndex];
                            
                            const markerFeature = new ol.Feature({
                                geometry: new ol.geom.Point(midPoint)
                            });
                            
                            const trafficIcon = getTrafficIcon(trafficStatus);
                            const trafficLabel = getTrafficLabel(trafficStatus);
                            
                            markerFeature.setStyle(new ol.style.Style({
                                image: new ol.style.Icon({
                                    src: `data:image/svg+xml;utf8,${encodeURIComponent(trafficIcon)}`,
                                    scale: 1.2,
                                    anchor: [0.5, 0.5]
                                })
                            }));
                            
                            routeSource1.addFeature(markerFeature);
                        }
                    }
                });
            }
            
            const tRecommendedBest = typeof t === 'function' ? t('route.recommendedBest') : '推荐路线（最佳）';
            const tEstimatedTime = typeof t === 'function' ? t('route.estimatedTime') : '预计时间';
            const tDistance = typeof t === 'function' ? t('route.distance') : '距离';
            const tUnknown = typeof t === 'function' ? t('route.unknown') : '未知';
            const tKilometers = typeof t === 'function' ? t('route.kilometers') : '公里';
            const tRealTimeTraffic = typeof t === 'function' ? t('route.realTimeTraffic') : '实时路况：';
            const tSmooth = typeof t === 'function' ? t('route.smooth') : '畅通';
            const tSlow = typeof t === 'function' ? t('route.slow') : '缓行';
            const tCongested = typeof t === 'function' ? t('route.congested') : '拥堵';
            const tSevere = typeof t === 'function' ? t('route.severe') : '严重拥堵';
            const tAlternativeSecond = typeof t === 'function' ? t('route.alternativeSecond') : '备选路线（次优）';
            const tRecommendedLabel = typeof t === 'function' ? t('route.recommendedLabel') : '推荐路线';
            const tAlternativeLabel = typeof t === 'function' ? t('route.alternativeLabel') : '备选路线';
            
            let html = `<div class="route-result">
                <h6 class="text-primary">🟦 ${tRecommendedBest}</h6>
                <ul class="list-group mb-3">
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${tEstimatedTime}
                        <span class="badge bg-primary rounded-pill">${optimalRoute.duration ? formatDuration(parseFloat(optimalRoute.duration)) : tUnknown}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${tDistance}
                        <span class="badge bg-primary rounded-pill">${optimalRoute.distance ? (parseFloat(optimalRoute.distance) / 1000).toFixed(1) : tUnknown} ${tKilometers}</span>
                    </li>
                </ul>
                <div class="traffic-legend mt-2">
                    <small class="text-muted">${tRealTimeTraffic}</small>
                    <span class="legend-item"><span class="legend-color" style="background: #00e400;"></span> ${tSmooth}</span>
                    <span class="legend-item"><span class="legend-color" style="background: #ffff00;"></span> ${tSlow}</span>
                    <span class="legend-item"><span class="legend-color" style="background: #ff7e00;"></span> ${tCongested}</span>
                    <span class="legend-item"><span class="legend-color" style="background: #ff0000;"></span> ${tSevere}</span>
                </div>`;
            
            if (alternativeRoute) {
                if (alternativeRoute.steps) {
                    let altCoords = [];
                    alternativeRoute.steps.forEach(step => {
                        const polyline = step.polyline;
                        const points = polyline.split(';');
                        points.forEach(p => {
                            const coords = p.split(',');
                            if (coords.length === 2) {
                                altCoords.push([parseFloat(coords[0]), parseFloat(coords[1])]);
                            }
                        });
                    });
                    
                    if (altCoords.length > 0) {
                        const altLineFeature = new ol.Feature({
                            geometry: new ol.geom.LineString(altCoords)
                        });
                        routeSource2.addFeature(altLineFeature);
                    }
                }
                
                html += `<h6 class="text-warning">🟧 ${tAlternativeSecond}</h6>
                    <ul class="list-group">
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${tEstimatedTime}
                            <span class="badge bg-warning text-dark rounded-pill">${alternativeRoute.duration ? formatDuration(parseFloat(alternativeRoute.duration)) : tUnknown}</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${tDistance}
                            <span class="badge bg-warning text-dark rounded-pill">${alternativeRoute.distance ? (parseFloat(alternativeRoute.distance) / 1000).toFixed(1) : tUnknown} ${tKilometers}</span>
                        </li>
                    </ul>
                    <div class="mt-2 text-muted small">
                        <span style="color: #2196F3;">━</span> ${tRecommendedLabel} &nbsp; 
                        <span style="color: #FF9800;">- -</span> ${tAlternativeLabel}
                    </div>`;
            }
            
            html += '</div>';
            resultDiv.innerHTML = html;
            
            const extent = ol.extent.createEmpty();
            ol.extent.extend(extent, routeSource1.getExtent());
            ol.extent.extend(extent, originMarkerSource.getExtent());
            ol.extent.extend(extent, destinationMarkerSource.getExtent());
            map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 500 });
        })
        .catch(err => {
            console.error('路线规划失败:', err);
            resultDiv.innerHTML = '<div class="alert alert-danger">路线规划失败，请检查网络连接</div>';
        });
}

function clearRoutes() {
    routeSource1.clear();
    routeSource2.clear();
    originMarkerSource.clear();
    destinationMarkerSource.clear();
    originCoords = null;
    document.getElementById('routeOrigin').value = '';
    document.getElementById('routeDestination').value = '';
    document.getElementById('routeResult').innerHTML = '';
}

let currentAttractionData = null;

let currentLocationCoords = null;
let refreshTimer = null;
const REFRESH_INTERVAL = 30000;

function startRealTimeUpdate(lon, lat, name) {
    stopRealTimeUpdate();
    currentLocationCoords = { lon, lat, name };
}

function stopRealTimeUpdate() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    currentLocationCoords = null;
}

function checkFavoriteStatus(attractionId) {
    fetch(`/api/favorites/check?attraction_id=${encodeURIComponent(attractionId)}`)
        .then(res => res.json())
        .then(data => {
            const btn = document.getElementById('favoriteBtn');
            if (btn) {
                if (data.isFavorite) {
                    btn.innerHTML = `⭐ ${t('favorites.favorited')}`;
                    btn.className = 'btn btn-sm btn-warning';
                } else {
                    btn.innerHTML = `⭐ ${t('attractions.favorite')}`;
                    btn.className = 'btn btn-sm btn-outline-warning';
                }
            }
        })
        .catch(err => console.error('检查收藏状态失败:', err));
}

function toggleFavorite(attractionId) {
    fetch(`/api/favorites/check?attraction_id=${encodeURIComponent(attractionId)}`)
        .then(res => res.json())
        .then(data => {
            if (data.isFavorite) {
                removeFavorite(attractionId);
            } else {
                addFavorite(attractionId);
            }
        })
        .catch(err => console.error('切换收藏状态失败:', err));
}

function addFavorite(attractionId) {
    if (!currentAttractionData || currentAttractionData.name !== attractionId) {
        return;
    }
    
    const data = {
        attraction_id: currentAttractionData.name,
        name: currentAttractionData.name,
        description: currentAttractionData.description,
        category: currentAttractionData.category,
        address: currentAttractionData.address,
        rating: currentAttractionData.rating,
        history: currentAttractionData.history,
        poetry: currentAttractionData.poetry,
        coordinates: currentAttractionData.coordinates
    };
    
    fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            alert('收藏成功！');
            const btn = document.getElementById('favoriteBtn');
            if (btn) {
                btn.innerHTML = '⭐ 已收藏';
                btn.className = 'btn btn-sm btn-warning';
            }
        } else {
            alert('收藏失败: ' + result.error);
        }
    })
    .catch(err => {
        console.error('添加收藏失败:', err);
        alert('收藏失败，请稍后重试');
    });
}

function removeFavorite(attractionId) {
    if (!confirm('确定要取消收藏吗？')) {
        return;
    }
    
    fetch(`/api/favorites?attraction_id=${encodeURIComponent(attractionId)}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            alert('已取消收藏');
            const btn = document.getElementById('favoriteBtn');
            if (btn) {
                btn.innerHTML = '⭐ 收藏';
                btn.className = 'btn btn-sm btn-outline-warning';
            }
            loadFavorites();
        } else {
            alert('取消收藏失败: ' + result.error);
        }
    })
    .catch(err => {
        console.error('取消收藏失败:', err);
        alert('取消收藏失败，请稍后重试');
    });
}

function toggleFavoritesPanel() {
    const favPanel = document.getElementById('favoritesPanel');
    const weatherPanel = document.getElementById('weatherPanel');
    
    if (favPanel.style.display === 'none') {
        weatherPanel.style.display = 'none';
        stopRealTimeUpdate();
        loadFavorites();
        favPanel.style.display = 'block';
    } else {
        favPanel.style.display = 'none';
        if (currentAttractionData && currentLocationCoords) {
            weatherPanel.style.display = 'block';
            startRealTimeUpdate(currentLocationCoords.lon, currentLocationCoords.lat, currentLocationCoords.name);
        }
    }
}

function hideFavoritesPanel() {
    const favPanel = document.getElementById('favoritesPanel');
    const weatherPanel = document.getElementById('weatherPanel');
    favPanel.style.display = 'none';
    if (currentAttractionData && currentLocationCoords) {
        weatherPanel.style.display = 'block';
        startRealTimeUpdate(currentLocationCoords.lon, currentLocationCoords.lat, currentLocationCoords.name);
    }
}

function loadFavorites() {
    fetch('/api/favorites')
        .then(res => res.json())
        .then(favorites => {
            const contentDiv = document.getElementById('favoritesContent');
            
            if (!favorites || favorites.length === 0) {
                contentDiv.innerHTML = `
                    <div class="favorites-empty">
                        <div class="empty-icon">⭐</div>
                        <p>${t('favorites.empty')}</p>
                        <p style="font-size: 0.8rem;">点击景点信息中的"收藏"按钮添加收藏</p>
                    </div>
                `;
                return;
            }
            
            const features = attractionsSource.getFeatures();
            
            let html = '';
            favorites.forEach(fav => {
                const feature = features.find(f => f.get('name') === fav.attraction_id);
                const props = feature ? feature.getProperties() : null;
                
                const name = props ? getTranslatedProperty(props, 'name') : fav.name;
                const description = props ? getTranslatedProperty(props, 'description') : fav.description;
                const rating = props ? props.rating : fav.rating;
                
                html += `
                    <div class="favorite-item">
                        <button class="remove-favorite" onclick="event.stopPropagation(); removeFavoriteFromPanel('${fav.attraction_id.replace(/'/g, "\\'")}')" title="${t('favorites.remove')}">✕</button>
                        <h6>${name}</h6>
                        ${description ? `<p>${description.substring(0, 50)}${description.length > 50 ? '...' : ''}</p>` : ''}
                        ${rating ? `<p><span class="label">${t('attractions.rating')}:</span> ${'★'.repeat(rating)}</p>` : ''}
                        <span class="view-on-map" onclick="viewFavoriteOnMap('${fav.attraction_id.replace(/'/g, "\\'")}')">${t('favorites.viewOnMap')}</span>
                    </div>
                `;
            });
            
            contentDiv.innerHTML = html;
        })
        .catch(err => {
            console.error('加载收藏失败:', err);
            document.getElementById('favoritesContent').innerHTML = `<p class="text-danger">${t('favorites.loadingFailed')}</p>`;
        });
}

function removeFavoriteFromPanel(attractionId) {
    fetch(`/api/favorites?attraction_id=${encodeURIComponent(attractionId)}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            loadFavorites();
            const btn = document.getElementById('favoriteBtn');
            if (btn && currentAttractionData && currentAttractionData.name === attractionId) {
                btn.innerHTML = '⭐ 收藏';
                btn.className = 'btn btn-sm btn-outline-warning';
            }
        }
    })
    .catch(err => console.error('取消收藏失败:', err));
}

function viewFavoriteOnMap(attractionId) {
    fetch(`/api/favorites`)
        .then(res => res.json())
        .then(favorites => {
            const fav = favorites.find(f => f.attraction_id === attractionId);
            if (fav && fav.coordinates) {
                const coords = JSON.parse(fav.coordinates);
                map.getView().animate({
                    center: coords,
                    zoom: 15,
                    duration: 500
                });
            }
        })
        .catch(err => console.error('查看收藏景点失败:', err));
}

function updateAttractionsListContent(features) {
    const content = document.getElementById('attractionsContent');
    let html = '';
    features.forEach(f => {
        const props = typeof f.getProperties === 'function' ? f.getProperties() : f.properties;
        const name = getAttractionNameByProps(props);
        const desc = getAttractionDescByProps(props);
        const coords = typeof f.getGeometry === 'function' ? f.getGeometry().getCoordinates() : f.geometry.coordinates;
        html += `<div class="attraction-item" onclick="focusAttraction([${coords}])">
            <h6>${name}</h6>
            <p>${desc}</p>
        </div>`;
    });
    content.innerHTML = html;
}

function getAttractionNameByProps(props) {
    const name = props.name || '';
    
    const langFieldMap = {
        'en': 'name_en',
        'zh-TW': 'name_zhTW',
        'ko': 'name_ko',
        'ja': 'name_ja'
    };
    
    const langField = langFieldMap[window.currentLang];
    if (langField && props[langField]) {
        return props[langField];
    }
    
    return name;
}

function getAttractionDescByProps(props) {
    const desc = props.description || '';
    
    const langFieldMap = {
        'en': 'description_en',
        'zh-TW': 'description_zhTW',
        'ko': 'description_ko',
        'ja': 'description_ja'
    };
    
    const langField = langFieldMap[window.currentLang];
    if (langField && props[langField]) {
        return props[langField];
    }
    
    return desc;
}

function refreshAttractionsDropdown() {
    const menu = document.getElementById('attractionsMenu');
    if (menu && attractionsFeaturesList.length > 0) {
        menu.innerHTML = '';
        attractionsFeaturesList.forEach(feature => {
            const props = feature.getProperties();
            const name = getAttractionNameByProps(props);
            const li = document.createElement('li');
            li.innerHTML = `<a class="dropdown-item" href="#" onclick="queryAttraction(${props.id})">${name}</a>`;
            menu.appendChild(li);
        });
    }
    
    const content = document.getElementById('attractionsContent');
    if (content && attractionsFeaturesList.length > 0) {
        updateAttractionsListContent(attractionsFeaturesList);
    }
}

function refreshAttractionsLayer() {
    refreshAttractionsDropdown();
    
    if (attractionsSource && attractionsLayer) {
        const selectedProps = currentSelectedFeature ? currentSelectedFeature.getProperties() : null;
        
        const features = attractionsSource.getFeatures();
        attractionsSource.clear();
        attractionsSource.addFeatures(features);
        
        if (selectedProps) {
            currentSelectedFeature = features.find(f => f.get('id') === selectedProps.id);
            window.currentSelectedFeature = currentSelectedFeature;
        }
        
        map.removeLayer(attractionsLayer);
        
        const newLayer = new ol.layer.Vector({
            source: attractionsSource,
            style: function(feature) {
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 10,
                        fill: new ol.style.Fill({
                            color: '#e74c3c'
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 3
                        })
                    }),
                    text: new ol.style.Text({
                        text: getAttractionName(feature) || '',
                        font: 'bold 13px Noto Serif SC, STKaiti, KaiTi, serif',
                        fill: new ol.style.Fill({
                            color: '#b22126'
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 3
                        }),
                        offsetY: -18,
                        textAlign: 'center',
                        textBaseline: 'bottom'
                    })
                });
            },
            visible: true,
            zIndex: 100
        });
        
        attractionsLayer = newLayer;
        map.addLayer(attractionsLayer);
        attractionsLayer.setVisible(true);
attractionsLayer.setZIndex(100);
        
        if (currentSelectedFeature) {
            const props = currentSelectedFeature.getProperties();
            const geom = currentSelectedFeature.getGeometry();
            const coords = geom.getCoordinates();
            
            let html = '<div class="popup-content">';
            
            const name = getAttractionName(currentSelectedFeature);
            if (name) {
                const attractionId = props.name;
                html += `<div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0;">${name}</h4>
                    <button id="favoriteBtn" class="btn btn-sm" style="padding: 4px 12px; font-size: 0.8rem;" onclick="toggleFavorite('${attractionId.replace(/'/g, "\\'")}')">
                        ⭐ ${t('favorites.title')}
                    </button>
                </div>`;
                checkFavoriteStatus(attractionId);
            }
            
            const getTranslatedProp = function(key) {
                const langFieldMap = {
                    'en': key + '_en',
                    'zh-TW': key + '_zhTW',
                    'ko': key + '_ko',
                    'ja': key + '_ja'
                };
                const langField = langFieldMap[window.currentLang];
                if (langField && props[langField]) {
                    return props[langField];
                }
                return props[key];
            };
            
            const displayProps = ['description', 'category', 'address', 'rating', 'history', 'poetry'];
            displayProps.forEach(key => {
                const value = getTranslatedProp(key);
                if (value) {
                    if (key === 'rating') {
                        html += `<p><span class="label">${t('attractions.rating')}:</span> ${'★'.repeat(value)}</p>`;
                    } else if (key === 'poetry') {
                        html += `<div class="poetry-section"><p><span class="label">📜 ${t('attractions.poetry')}:</span></p><pre style="white-space: pre-wrap; font-family: 'Noto Serif SC', serif; font-size: 0.85rem; color: #5c3d2e; background: rgba(201, 162, 39, 0.1); padding: 10px; border-radius: 4px; border-left: 3px solid #c9a227;">${value}</pre></div>`;
                    } else if (key === 'history') {
                        html += `<p><span class="label">📖 ${t('attractions.historyLabel')}:</span></p><p style="text-indent: 2em; line-height: 1.7;">${value}</p>`;
                    } else {
                        html += `<p><span class="label">${getLabel(key)}:</span> ${value}</p>`;
                    }
                }
            });
            
            html += '</div>';
            document.getElementById('featureInfo').innerHTML = html;
document.getElementById('featureInfo').style.display = 'block';
            
            if (name) {
                setTimeout(() => loadReviews(name, coords.join(',')), 100);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // changeLanguage('zh');
});

// 自定义全屏按钮：让整个页面进入全屏
function toggleCustomFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function (err) {
            alert('无法进入全屏模式：' + err.message);
        });
    } else {
        document.exitFullscreen();
    }
}

// 获取需要管理的图层
function getManagedLayer(layerName) {
    if (layerName === 'attractions') {
        return attractionsLayer;
    }

    if (layerName === 'draw') {
        return drawLayer;
    }

    if (layerName === 'track') {
        return trackLayer;
    }

    if (layerName === 'route') {
        return routeLayer1;
    }

    return null;
}

// 图层显示 / 隐藏
function toggleManagedLayer(layerName, visible) {
    const layer = getManagedLayer(layerName);

    if (!layer) {
        alert('没有找到对应图层：' + layerName);
        return;
    }

    layer.setVisible(visible);
}

// 图层透明度调整
function setManagedLayerOpacity(layerName, opacity) {
    const layer = getManagedLayer(layerName);

    if (!layer) {
        alert('没有找到对应图层：' + layerName);
        return;
    }

    layer.setOpacity(Number(opacity));
}

// 管理图层顺序：数组越靠后，图层显示越靠上
let managedLayerOrder = ['attractions', 'draw'];

// 重新应用图层顺序
function applyManagedLayerOrder() {
    managedLayerOrder.forEach(function(layerName, index) {
        const layer = getManagedLayer(layerName);

        if (layer) {
            // 100 起步，避免被底图盖住
            layer.setZIndex(100 + index * 10);
        }
    });

    console.log('当前图层顺序：', managedLayerOrder);
}

// 图层上移
function moveManagedLayerUp(layerName) {
    const index = managedLayerOrder.indexOf(layerName);

    if (index === -1) {
        alert('没有找到对应图层：' + layerName);
        return;
    }

    if (index === managedLayerOrder.length - 1) {
        alert('该图层已经在最上层了');
        return;
    }

    const temp = managedLayerOrder[index];
    managedLayerOrder[index] = managedLayerOrder[index + 1];
    managedLayerOrder[index + 1] = temp;

    applyManagedLayerOrder();

    alert('图层已上移。当前顺序：' + getLayerOrderText());
}

// 图层下移
function moveManagedLayerDown(layerName) {
    const index = managedLayerOrder.indexOf(layerName);

    if (index === -1) {
        alert('没有找到对应图层：' + layerName);
        return;
    }

    if (index === 0) {
        alert('该图层已经在最下层了');
        return;
    }

    const temp = managedLayerOrder[index];
    managedLayerOrder[index] = managedLayerOrder[index - 1];
    managedLayerOrder[index - 1] = temp;

    applyManagedLayerOrder();

    alert('图层已下移。当前顺序：' + getLayerOrderText());
}

// 把图层英文名转换成中文，方便提示
function getLayerOrderText() {
    return managedLayerOrder.map(function(layerName) {
        if (layerName === 'attractions') {
            return '景点图层';
        }

        if (layerName === 'draw') {
            return '绘制图层';
        }

        return layerName;
    }).join(' < ');
}

// 页面加载后初始化图层顺序
setTimeout(function() {
    applyManagedLayerOrder();
}, 500);

// 热力图开关
function toggleHeatmap() {
    const isVisible = heatmapLayer.getVisible();

    heatmapLayer.setVisible(!isVisible);

    if (!isVisible) {
        alert('景点热力图已开启。建议缩放到全国或城市范围查看效果。');
    } else {
        alert('景点热力图已关闭。');
    }
}

// 缓冲区分析：点击一个景点，生成指定半径的缓冲区，并统计范围内景点
function startBufferAnalysis() {
    clearDraw();

    const radiusInput = prompt('请输入缓冲区半径，单位：公里', '50');

    if (radiusInput === null) {
        return;
    }

    const radiusKm = Number(radiusInput);

    if (isNaN(radiusKm) || radiusKm <= 0) {
        alert('请输入正确的缓冲区半径，例如：10、50、100');
        return;
    }

    alert('缓冲区分析已开启：请点击一个景点作为分析中心。');

    map.once('singleclick', function(evt) {
        const centerFeature = map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
            if (layer === attractionsLayer) {
                return feature;
            }
            return null;
        });

        if (!centerFeature) {
            alert('请点击红色景点点位，不能点击空白地图区域。');
            return;
        }

        const centerCoord = centerFeature.getGeometry().getCoordinates();
        const centerName = getAttractionName(centerFeature) || centerFeature.get('name') || '选中景点';

        bufferSource.clear();

        const radiusMeters = radiusKm * 1000;

        // 创建真实地理距离的缓冲区多边形
        const bufferPolygon = createGeodesicCircle(centerCoord, radiusMeters, 128);

        const bufferFeature = new ol.Feature({
            geometry: bufferPolygon,
            type: 'buffer',
            centerName: centerName,
            radiusKm: radiusKm
        });

        bufferSource.addFeature(bufferFeature);

        // 统计缓冲区范围内的景点
        const resultFeatures = [];

        attractionsSource.getFeatures().forEach(function(feature) {
            const coord = feature.getGeometry().getCoordinates();

            const distance = ol.sphere.getDistance(
                centerCoord,
                coord,
                6371008.8
            );

            if (distance <= radiusMeters) {
                resultFeatures.push({
                    feature: feature,
                    distance: distance
                });
            }
        });

        resultFeatures.sort(function(a, b) {
            return a.distance - b.distance;
        });

        showBufferAnalysisResult(centerName, radiusKm, resultFeatures);

        map.getView().fit(bufferFeature.getGeometry().getExtent(), {
            padding: [80, 420, 80, 80],
            duration: 800
        });
    });
}

// 根据中心点和半径生成缓冲区圆面
// 当前项目地图投影是 EPSG:4326，所以这里用经纬度球面公式生成真实距离圆
function createGeodesicCircle(centerCoord, radiusMeters, points) {
    const lon = centerCoord[0] * Math.PI / 180;
    const lat = centerCoord[1] * Math.PI / 180;
    const earthRadius = 6371008.8;
    const angularDistance = radiusMeters / earthRadius;

    const coordinates = [];

    for (let i = 0; i <= points; i++) {
        const bearing = 2 * Math.PI * i / points;

        const destLat = Math.asin(
            Math.sin(lat) * Math.cos(angularDistance) +
            Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing)
        );

        const destLon = lon + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
            Math.cos(angularDistance) - Math.sin(lat) * Math.sin(destLat)
        );

        coordinates.push([
            destLon * 180 / Math.PI,
            destLat * 180 / Math.PI
        ]);
    }

    return new ol.geom.Polygon([coordinates]);
}

// 在右侧属性面板显示缓冲区分析结果
function showBufferAnalysisResult(centerName, radiusKm, resultFeatures) {
    let html = `
        <h5 style="color:#b22126; font-weight:bold;">缓冲区分析结果</h5>
        <hr>
        <p><strong>分析中心：</strong>${centerName}</p>
        <p><strong>缓冲半径：</strong>${radiusKm} 公里</p>
        <p><strong>范围内景点数量：</strong>${resultFeatures.length} 个</p>
        <hr>
    `;

    if (resultFeatures.length === 0) {
        html += `<p>该范围内没有查询到景点。</p>`;
    } else {
        html += `<div style="max-height: 300px; overflow-y: auto;">`;

        resultFeatures.forEach(function(item, index) {
            const feature = item.feature;
            const name = getAttractionName(feature) || feature.get('name') || '未命名景点';
            const distanceKm = (item.distance / 1000).toFixed(2);

            html += `
                <div style="padding: 6px 0; border-bottom: 1px solid #ddd;">
                    <strong>${index + 1}. ${name}</strong><br>
                    <span>距离中心：${distanceKm} 公里</span>
                </div>
            `;
        });

        html += `</div>`;
    }

    document.getElementById('featureInfo').innerHTML = html;
document.getElementById('featureInfo').style.display = 'block';
}

// 叠加分析：绘制一个多边形，将分析区域与景点图层叠加，统计区域内景点
function startOverlayAnalysis() {
    clearDraw();

    if (!attractionsSource || attractionsSource.getFeatures().length === 0) {
        alert('景点数据还没有加载完成，请稍等几秒后再试。');
        return;
    }

    overlayAnalysisSource.clear();

    alert('叠加分析已开启：请在地图上点击绘制一个分析区域，双击结束绘制。系统会统计区域内的景点。');

    drawInteraction = new ol.interaction.Draw({
        source: overlayAnalysisSource,
        type: 'Polygon',
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 193, 7, 0.25)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ff9800',
                width: 3,
                lineDash: [10, 6]
            })
        })
    });

    map.addInteraction(drawInteraction);

    drawInteraction.on('drawend', function(evt) {
        const analysisAreaFeature = evt.feature;
        analysisAreaFeature.set('analysisType', 'overlayArea');

        // drawend 触发时要素刚绘制完成，延迟 0 秒再移除交互，避免影响绘制收尾
        setTimeout(function() {
            if (drawInteraction) {
                map.removeInteraction(drawInteraction);
                drawInteraction = null;
            }

            runOverlayAnalysis(analysisAreaFeature);
        }, 0);
    });
}

// 执行叠加分析统计
function runOverlayAnalysis(analysisAreaFeature) {
    const analysisGeometry = analysisAreaFeature.getGeometry();
    const resultFeatures = [];
    const categoryStats = {};
    const cityStats = {};

    let ratingTotal = 0;
    let ratingCount = 0;

    attractionsSource.getFeatures().forEach(function(feature) {
        const geometry = feature.getGeometry();

        if (!geometry || geometry.getType() !== 'Point') {
            return;
        }

        const coord = geometry.getCoordinates();

        // 点是否落入用户绘制的多边形区域
        if (analysisGeometry.intersectsCoordinate(coord)) {
            resultFeatures.push(feature);

            const category = getAttractionCategory(feature) || feature.get('category') || '未分类';
            const city = feature.get('city') || feature.get('province') || '未知地区';
            const rating = Number(feature.get('rating'));

            categoryStats[category] = (categoryStats[category] || 0) + 1;
            cityStats[city] = (cityStats[city] || 0) + 1;

            if (!isNaN(rating)) {
                ratingTotal += rating;
                ratingCount += 1;
            }

            // 在叠加分析图层上添加高亮点，不改变原始景点图层
            const highlightPoint = new ol.Feature({
                geometry: new ol.geom.Point(coord),
                analysisType: 'overlayPoint',
                label: String(resultFeatures.length),
                sourceName: getAttractionName(feature) || feature.get('name') || '未命名景点'
            });

            overlayAnalysisSource.addFeature(highlightPoint);
        }
    });

    const projection = map.getView().getProjection();
    const areaValue = ol.sphere.getArea(analysisGeometry, {
        projection: projection
    });

    const areaText = formatArea(Math.abs(areaValue));
    const averageRating = ratingCount > 0 ? (ratingTotal / ratingCount).toFixed(1) : '暂无';

    showOverlayAnalysisResult(resultFeatures, categoryStats, cityStats, areaText, averageRating);

    const extent = analysisAreaFeature.getGeometry().getExtent();

    map.getView().fit(extent, {
        padding: [80, 420, 80, 80],
        duration: 800,
        maxZoom: 12
    });
}

// 显示叠加分析结果
function showOverlayAnalysisResult(resultFeatures, categoryStats, cityStats, areaText, averageRating) {
    const categoryHtml = Object.keys(categoryStats).length === 0
        ? '<p>暂无类别统计。</p>'
        : Object.keys(categoryStats).map(function(category) {
            return `<span class="badge bg-warning text-dark me-1 mb-1">${escapeHtml(category)}：${categoryStats[category]} 个</span>`;
        }).join('');

    const cityHtml = Object.keys(cityStats).length === 0
        ? '<p>暂无地区统计。</p>'
        : Object.keys(cityStats).map(function(city) {
            return `<span class="badge bg-info text-dark me-1 mb-1">${escapeHtml(city)}：${cityStats[city]} 个</span>`;
        }).join('');

    let html = `
        <h5 style="color:#b22126; font-weight:bold;">叠加分析结果</h5>
        <hr>
        <p><strong>分析方式：</strong>用户绘制区域 ∩ 景点点位图层</p>
        <p><strong>分析区域面积：</strong>${areaText}</p>
        <p><strong>区域内景点数量：</strong>${resultFeatures.length} 个</p>
        <p><strong>区域内景点平均评分：</strong>${averageRating}</p>
        <hr>
        <p><strong>类别叠加统计：</strong></p>
        <div class="mb-2">${categoryHtml}</div>
        <p><strong>地区叠加统计：</strong></p>
        <div class="mb-2">${cityHtml}</div>
        <hr>
    `;

    if (resultFeatures.length === 0) {
        html += '<p>当前绘制区域内没有叠加到景点。可以重新点击“叠加分析”，画一个更大的区域。</p>';
    } else {
        html += '<div style="max-height: 300px; overflow-y: auto;">';

        resultFeatures.forEach(function(feature, index) {
            const name = getAttractionName(feature) || feature.get('name') || '未命名景点';
            const category = getAttractionCategory(feature) || feature.get('category') || '未分类';
            const province = getAttractionProvince(feature) || feature.get('province') || '';
            const city = getAttractionCity(feature) || feature.get('city') || '';
            const rating = feature.get('rating') || '暂无';
            const address = getAttractionDisplayAddress(feature);
            const locationText = [province, city].filter(Boolean).join(' - ') || '未知地区';

            html += `
                <div style="padding: 8px 0; border-bottom: 1px solid #ddd;">
                    <strong>${index + 1}. ${escapeHtml(name)}</strong><br>
                    <span>类别：${escapeHtml(category)}</span><br>
                    <span>地区：${escapeHtml(locationText)}</span><br>
                    <span>评分：${escapeHtml(rating)}</span><br>
                    <span>地址：${escapeHtml(address)}</span>
                </div>
            `;
        });

        html += '</div>';
    }

    const featureInfo = document.getElementById('featureInfo');

    if (featureInfo) {
        featureInfo.innerHTML = html;
        featureInfo.style.display = 'block';
    }

    if (typeof showInfoPanel === 'function') {
        showInfoPanel();
    }
}

// 圆选查询：绘制一个圆，查询圆内的景点
function startCircleSelect() {
    clearDraw();

    alert('圆选查询已开启：请在地图上拖拽绘制一个圆形范围。');

    drawInteraction = new ol.interaction.Draw({
        source: drawSource,
        type: 'Circle',
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(0, 123, 255, 0.15)'
            }),
            stroke: new ol.style.Stroke({
                color: '#007bff',
                width: 3,
                lineDash: [8, 6]
            })
        })
    });

    map.addInteraction(drawInteraction);

    drawInteraction.on('drawend', function(evt) {
        const circleGeometry = evt.feature.getGeometry();

        // 圆心坐标，经纬度
        const center = circleGeometry.getCenter();

        // 圆半径，注意：当前地图是 EPSG:4326，所以这里的半径是“度”，不是米
        const radiusDegree = circleGeometry.getRadius();

        // 取圆右侧边界上的一个点
        const edgePoint = [
            center[0] + radiusDegree,
            center[1]
        ];

        // 把半径转换成真实距离，单位：米
        const radiusMeters = ol.sphere.getDistance(center, edgePoint, 6371008.8);

        const results = [];

        attractionsSource.getFeatures().forEach(function(feature) {
            const geometry = feature.getGeometry();

            if (!geometry) {
                return;
            }

            const coordinate = geometry.getCoordinates();

            // 计算景点到圆心的真实距离，单位：米
            const distanceMeters = ol.sphere.getDistance(center, coordinate, 6371008.8);

            if (distanceMeters <= radiusMeters) {
                results.push(feature);
            }
        });

        showSpatialQueryResult('圆选查询结果', results);

        map.removeInteraction(drawInteraction);
        drawInteraction = null;
    });
}

// 多边形查询：绘制一个多边形，查询多边形范围内的景点
function startPolygonSelect() {
    clearDraw();

    alert('多边形查询已开启：请在地图上依次点击绘制多边形，双击结束。');

    drawInteraction = new ol.interaction.Draw({
        source: drawSource,
        type: 'Polygon',
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 193, 7, 0.18)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ffc107',
                width: 3,
                lineDash: [8, 6]
            })
        })
    });

    map.addInteraction(drawInteraction);

    drawInteraction.on('drawend', function(evt) {
        const polygonGeometry = evt.feature.getGeometry();
        const results = [];

        attractionsSource.getFeatures().forEach(function(feature) {
            const geometry = feature.getGeometry();

            if (!geometry) {
                return;
            }

            const coordinate = geometry.getCoordinates();

            if (polygonGeometry.intersectsCoordinate(coordinate)) {
                results.push(feature);
            }
        });

        showSpatialQueryResult('多边形查询结果', results);

        map.removeInteraction(drawInteraction);
        drawInteraction = null;
    });
}

// 显示空间查询结果到右侧属性面板
function showSpatialQueryResult(title, results) {
    let html = `
        <h5 style="color:#b22126; font-weight:bold;">${title}</h5>
        <hr>
        <p><strong>查询结果数量：</strong>${results.length} 个景点</p>
        <hr>
    `;

    if (results.length === 0) {
        html += `<p>当前范围内没有查询到景点。</p>`;
    } else {
        html += `<div style="max-height: 330px; overflow-y: auto;">`;

        results.forEach(function(feature, index) {
            const name = getAttractionName(feature) || feature.get('name') || '未命名景点';
            const category = feature.get('category') || feature.get('type') || '未分类';
            const address = feature.get('address') || '暂无地址';

            html += `
                <div style="padding: 8px 0; border-bottom: 1px solid #ddd;">
                    <strong>${index + 1}. ${name}</strong><br>
                    <span>类别：${category}</span><br>
                    <span>地址：${address}</span>
                </div>
            `;
        });

        html += `</div>`;
    }

    const featureInfo = document.getElementById('featureInfo');

    if (featureInfo) {
        featureInfo.innerHTML = html;
        featureInfo.style.display = 'block';
    } else {
        alert(title + '：共查询到 ' + results.length + ' 个景点');
    }
}
// 属性查询 / 关键词搜索
function searchAttractionsByAttribute() {
    normalizeAttractionCategories();
    const keywordInput = document.getElementById('attrSearchKeyword');
    const categorySelect = document.getElementById('attrSearchCategory');

    const keyword = keywordInput ? keywordInput.value.trim().toLowerCase() : '';
    const category = categorySelect ? categorySelect.value.trim() : '';

    if (!keyword && !category) {
        alert('请输入关键词，或选择一个景点类别。');
        return;
    }

    searchResultSource.clear();

    const results = [];

    attractionsSource.getFeatures().forEach(function(feature) {
        const name = (getAttractionName(feature) || feature.get('name') || '').toString();
        const featureCategory = (feature.get('category') || feature.get('type') || '').toString();
        const address = (feature.get('address') || '').toString();
        const description = (feature.get('description') || feature.get('desc') || '').toString();

        const searchText = [
            name,
            featureCategory,
            address,
            description
        ].join(' ').toLowerCase();

        const matchKeyword = keyword ? searchText.includes(keyword) : true;
        const matchCategory = category ? featureCategory.includes(category) : true;

        if (matchKeyword && matchCategory) {
            results.push(feature);

            const highlightFeature = feature.clone();
            searchResultSource.addFeature(highlightFeature);
        }
    });

    showAttributeSearchResult(keyword, category, results);

    if (results.length > 0) {
        const extent = searchResultSource.getExtent();

        map.getView().fit(extent, {
            padding: [100, 420, 100, 100],
            duration: 800,
            maxZoom: 9
        });
    }
}

// 在右侧属性面板显示属性查询结果
function showAttributeSearchResult(keyword, category, results) {
    let html = `
        <h5 style="color:#b22126; font-weight:bold;">属性查询结果</h5>
        <hr>
        <p><strong>关键词：</strong>${keyword || '未填写'}</p>
        <p><strong>类别：</strong>${category || '全部类别'}</p>
        <p><strong>查询结果数量：</strong>${results.length} 个景点</p>
        <hr>
    `;

    if (results.length === 0) {
        html += `<p>没有查询到符合条件的景点，请更换关键词再试。</p>`;
    } else {
        html += `<div style="max-height: 330px; overflow-y: auto;">`;

        results.forEach(function(feature, index) {
            const name = getAttractionName(feature) || feature.get('name') || '未命名景点';
            const category = feature.get('category') || feature.get('type') || '未分类';
            const address = feature.get('address') || '暂无地址';

            const coord = feature.getGeometry().getCoordinates();

            html += `
                <div style="padding: 8px 0; border-bottom: 1px solid #ddd;">
                    <strong>${index + 1}. ${name}</strong><br>
                    <span>类别：${category}</span><br>
                    <span>地址：${address}</span><br>
                    <button class="btn btn-sm btn-outline-primary mt-1"
                            onclick="locateSearchResult(${coord[0]}, ${coord[1]})">
                        定位
                    </button>
                </div>
            `;
        });

        html += `</div>`;
    }

    const featureInfo = document.getElementById('featureInfo');

    if (featureInfo) {
        featureInfo.innerHTML = html;
        featureInfo.style.display = 'block';
    } else {
        alert('属性查询完成，共查询到 ' + results.length + ' 个景点。');
    }
}

// 定位到某个查询结果
function locateSearchResult(lon, lat) {
    map.getView().animate({
        center: [lon, lat],
        zoom: 11,
        duration: 800
    });
}

// 清除属性查询高亮结果
function clearAttributeSearchResult() {
    if (typeof searchResultSource !== 'undefined') {
        searchResultSource.clear();
    }

    const keywordInput = document.getElementById('attrSearchKeyword');

    if (keywordInput) {
        keywordInput.value = '';
    }
}

// 聚类分析开关
function toggleClusterLayer() {
    const isVisible = clusterLayer.getVisible();

    if (!isVisible) {
        clusterLayer.setVisible(true);

        // 开启聚类时，隐藏原来的景点点位，避免重叠
        attractionsLayer.setVisible(false);

        // 如果热力图正在显示，顺手关闭，避免画面太乱
        if (typeof heatmapLayer !== 'undefined') {
            heatmapLayer.setVisible(false);
        }

        alert('聚类分析已开启：地图上的数字表示该区域聚合的景点数量。');
    } else {
        clusterLayer.setVisible(false);

        // 关闭聚类时，恢复原来的景点图层
        attractionsLayer.setVisible(true);

        alert('聚类分析已关闭，已恢复普通景点图层。');
    }
}

// 点击聚类点：多个景点时放大，单个景点时显示信息
map.on('click', function(evt) {
    if (!clusterLayer.getVisible()) {
        return;
    }

    const clusterFeature = map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
        if (layer === clusterLayer) {
            return feature;
        }
        return null;
    });

    if (!clusterFeature) {
        return;
    }

    const features = clusterFeature.get('features');

    if (!features || features.length === 0) {
        return;
    }

    if (features.length === 1) {
        showSpatialQueryResult('聚类景点详情', features);
    } else {
        const extent = ol.extent.createEmpty();

        features.forEach(function(feature) {
            ol.extent.extend(extent, feature.getGeometry().getExtent());
        });

        map.getView().fit(extent, {
            padding: [100, 420, 100, 100],
            duration: 800,
            maxZoom: 10
        });

        showSpatialQueryResult('聚类分析结果', features);
    }
});

// 显示属性 / 查询结果弹窗
function showInfoPanel() {
    const panel = document.getElementById('infoPanel');

    if (!panel) {
        return;
    }

    panel.style.display = 'block';
    panel.classList.add('show');
}

// 清除叠加分析结果，包括绘制的黄色分析区域和高亮景点点
function clearOverlayAnalysisResult() {
    if (typeof overlayAnalysisSource !== 'undefined' && overlayAnalysisSource) {
        overlayAnalysisSource.clear();
    }

    // 如果叠加分析绘制交互还没结束，也一并移除，防止残留
    if (typeof drawInteraction !== 'undefined' && drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
    }
}

function closeInfoPanel() {
    const panel = document.getElementById('infoPanel');

    if (!panel) {
        return;
    }

    panel.classList.remove('show');
    panel.style.display = 'none';

    const featureInfo = document.getElementById('featureInfo');

    if (featureInfo) {
        featureInfo.innerHTML = '';
        featureInfo.style.display = 'none';
    }

    // 只在用户关闭属性信息框时，清除空间查询绘制范围
    if (typeof clearSpatialQueryRangeFeatures === 'function') {
        clearSpatialQueryRangeFeatures();
    }

    // 如果你叠加分析也希望关闭属性框后清除，可以保留
    if (typeof clearOverlayAnalysisResult === 'function') {
        clearOverlayAnalysisResult();
    }
}

// 自动监听 featureInfo 内容变化：只要有结果写入，就弹出属性信息框
function setupInfoPanelAutoShow() {
    if (window.infoPanelObserverInitialized) {
        return;
    }

    const featureInfo = document.getElementById('featureInfo');

    if (!featureInfo) {
        return;
    }

    const observer = new MutationObserver(function() {
        const text = featureInfo.innerText.trim();

        if (text && text !== '点击要素查看详细信息') {
            showInfoPanel();
        }
    });

    observer.observe(featureInfo, {
        childList: true,
        subtree: true,
        characterData: true
    });

    window.infoPanelObserverInitialized = true;
}

// 页面加载后默认隐藏属性信息框
document.addEventListener('DOMContentLoaded', function() {
    closeInfoPanel();
    setupInfoPanelAutoShow();
});

// 防止部分脚本后加载，延迟再初始化一次
setTimeout(function() {
    closeInfoPanel();
    setupInfoPanelAutoShow();
}, 800);

// ===== 多边形查询：左键添加顶点，右键确认查询 =====

let polygonSelectPoints = [];
let polygonSelectFeature = null;
let polygonSelectClickKey = null;
let polygonSelectMoveKey = null;
let polygonSelectConfirmHandler = null;
let polygonSelectMouseDownHandler = null;
let polygonSelectContextMenuBlocker = null;
let polygonSelectFinished = false;

// 清除多边形查询事件监听
function clearPolygonSelectListeners(keepContextMenuBlockerTemporarily) {
    if (polygonSelectClickKey) {
        ol.Observable.unByKey(polygonSelectClickKey);
        polygonSelectClickKey = null;
    }

    if (polygonSelectMoveKey) {
        ol.Observable.unByKey(polygonSelectMoveKey);
        polygonSelectMoveKey = null;
    }

    if (polygonSelectMouseDownHandler) {
        map.getViewport().removeEventListener('mousedown', polygonSelectMouseDownHandler, true);
        polygonSelectMouseDownHandler = null;
    }

    if (polygonSelectContextMenuBlocker) {
        const blocker = polygonSelectContextMenuBlocker;

        if (keepContextMenuBlockerTemporarily) {
            setTimeout(function () {
                document.removeEventListener('contextmenu', blocker, true);
            }, 600);
        } else {
            document.removeEventListener('contextmenu', blocker, true);
        }

        polygonSelectContextMenuBlocker = null;
    }

    polygonSelectConfirmHandler = null;
    polygonSelectFinished = false;
    polygonSelectPoints = [];
    polygonSelectFeature = null;
}

// 根据已有顶点和鼠标当前位置生成预览几何
// 1 个点时：预览线段
// 2 个点及以上时：预览多边形
function buildPolygonGeometry(points, previewCoord) {
    let coords = points.slice();

    if (previewCoord) {
        coords.push(previewCoord);
    }

    // 第一次点击后，鼠标移动时显示一条虚线
    if (coords.length === 2) {
        return new ol.geom.LineString(coords);
    }

    // 至少 3 个点才能形成多边形
    if (coords.length < 3) {
        return null;
    }

    const polygonCoords = coords.slice();

    // 闭合多边形：最后一个点回到第一个点
    const first = polygonCoords[0];
    const last = polygonCoords[polygonCoords.length - 1];

    if (first[0] !== last[0] || first[1] !== last[1]) {
        polygonCoords.push(first);
    }

    return new ol.geom.Polygon([polygonCoords]);
}

// 多边形查询：左键添加点，右键确认查询
function startPolygonSelect() {
    clearDraw();

    if (typeof clearBoxSelectListeners === 'function') {
        clearBoxSelectListeners();
    }

    if (typeof clearTwoClickQueryListeners === 'function') {
        clearTwoClickQueryListeners();
    }

    if (typeof clearCircleSelectListeners === 'function') {
        clearCircleSelectListeners();
    }

    clearPolygonSelectListeners();

    if (typeof drawLayer !== 'undefined' && drawLayer) {
        drawLayer.setVisible(true);
        drawLayer.setZIndex(1200);
    }

    alert('多边形查询已开启：左键单击添加范围顶点，右键单击确认查询。');

    polygonSelectPoints = [];
    polygonSelectFinished = false;

    polygonSelectFeature = new ol.Feature({
        geometry: new ol.geom.Polygon([])
    });

    polygonSelectFeature.setProperties({
        type: 'polygon_select',
        createdAt: new Date().toISOString()
    });

    polygonSelectFeature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(255, 193, 7, 0.18)'
        }),
        stroke: new ol.style.Stroke({
            color: '#ffc107',
            width: 3,
            lineDash: [8, 6]
        }),
        image: new ol.style.Circle({
            radius: 5,
            fill: new ol.style.Fill({
                color: '#ffc107'
            }),
            stroke: new ol.style.Stroke({
                color: '#ffffff',
                width: 2
            })
        })
    }));

    drawSource.addFeature(polygonSelectFeature);

    // 左键单击：添加一个顶点
    polygonSelectClickKey = map.on('singleclick', function (evt) {
        if (polygonSelectFinished) {
            return;
        }

        polygonSelectPoints.push(evt.coordinate);

        const polygonGeometry = buildPolygonGeometry(polygonSelectPoints, null);

        if (polygonGeometry) {
            polygonSelectFeature.setGeometry(polygonGeometry);
        }
    });

    // 鼠标移动：动态预览线段或多边形
    polygonSelectMoveKey = map.on('pointermove', function (evt) {
        if (
            polygonSelectFinished ||
            polygonSelectPoints.length < 1 ||
            !polygonSelectFeature
        ) {
            return;
        }

        const previewGeometry = buildPolygonGeometry(polygonSelectPoints, evt.coordinate);

        if (previewGeometry) {
            polygonSelectFeature.setGeometry(previewGeometry);
        }
    });

    // 统一的“确认多边形查询”函数
    polygonSelectConfirmHandler = function (event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();

            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }

        if (polygonSelectFinished) {
            return;
        }

        if (polygonSelectPoints.length < 3) {
            alert('多边形至少需要 3 个顶点，请继续用左键添加点。');
            return;
        }

        polygonSelectFinished = true;

        const finalGeometry = buildPolygonGeometry(polygonSelectPoints, null);

        if (!finalGeometry) {
            polygonSelectFinished = false;
            alert('多边形范围无效，请重新绘制。');
            return;
        }

        if (polygonSelectFeature) {
            polygonSelectFeature.setGeometry(finalGeometry);
        }

        const results = [];

        attractionsSource.getFeatures().forEach(function (feature) {
            const geometry = feature.getGeometry();

            if (!geometry) {
                return;
            }

            const coord = geometry.getCoordinates();

            if (finalGeometry.intersectsCoordinate(coord)) {
                results.push(feature);
            }
        });

        showSpatialQueryResult('多边形查询结果', results);

        // 注意：这里清除的是事件监听，不清除地图上的多边形范围
        // 多边形范围等用户关闭属性信息框后，由 closeInfoPanel() 里的 clearSpatialQueryRangeFeatures() 清除
        clearPolygonSelectListeners(true);

        alert('多边形查询完成，共查询到 ' + results.length + ' 个景点。');
    };

    // 右键按下时，立即确认查询
    polygonSelectMouseDownHandler = function (event) {
        if (event.button !== 2) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        if (typeof polygonSelectConfirmHandler === 'function') {
            polygonSelectConfirmHandler(event);
        }
    };

    map.getViewport().addEventListener('mousedown', polygonSelectMouseDownHandler, true);

    // 禁止浏览器默认右键菜单
    // 这段会短暂保留到右键菜单事件结束后再移除
    polygonSelectContextMenuBlocker = function (event) {
        const target = event.target;

        if (
            target &&
            target.closest &&
            target.closest('#map')
        ) {
            event.preventDefault();
            event.stopPropagation();

            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }

            // 兜底：如果 mousedown 没触发成功，这里也能确认查询
            if (
                !polygonSelectFinished &&
                typeof polygonSelectConfirmHandler === 'function'
            ) {
                polygonSelectConfirmHandler(event);
            }
        }
    };

    document.addEventListener('contextmenu', polygonSelectContextMenuBlocker, true);
}

// ===== 圆选查询：第一次左键单击确定圆心，第二次左键单击确认范围 =====

// 圆选查询专用状态
let circleSelectStartCoord = null;
let circleSelectFeature = null;
let circleSelectClickKey = null;
let circleSelectMoveKey = null;

// 清除圆选查询监听
function clearCircleSelectListeners() {
    if (circleSelectClickKey) {
        ol.Observable.unByKey(circleSelectClickKey);
        circleSelectClickKey = null;
    }

    if (circleSelectMoveKey) {
        ol.Observable.unByKey(circleSelectMoveKey);
        circleSelectMoveKey = null;
    }

    circleSelectStartCoord = null;
    circleSelectFeature = null;
}

// 根据圆心和半径生成真实地理圆面
// 适配当前项目 EPSG:4326 经纬度地图
function createCircleSelectGeodesicCircle(centerCoord, radiusMeters, points) {
    const lon = centerCoord[0] * Math.PI / 180;
    const lat = centerCoord[1] * Math.PI / 180;
    const earthRadius = 6371008.8;
    const angularDistance = radiusMeters / earthRadius;

    const coordinates = [];

    for (let i = 0; i <= points; i++) {
        const bearing = 2 * Math.PI * i / points;

        const destLat = Math.asin(
            Math.sin(lat) * Math.cos(angularDistance) +
            Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing)
        );

        const destLon = lon + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
            Math.cos(angularDistance) - Math.sin(lat) * Math.sin(destLat)
        );

        coordinates.push([
            destLon * 180 / Math.PI,
            destLat * 180 / Math.PI
        ]);
    }

    return new ol.geom.Polygon([coordinates]);
}

// 圆选查询：第一次左键确定圆心，第二次左键确认半径并查询
function startCircleSelect() {
    clearDraw();

    if (typeof clearBoxSelectListeners === 'function') {
        clearBoxSelectListeners();
    }

    if (typeof clearTwoClickQueryListeners === 'function') {
        clearTwoClickQueryListeners();
    }

    if (typeof clearPolygonSelectListeners === 'function') {
        clearPolygonSelectListeners();
    }

    clearCircleSelectListeners();

    if (typeof drawLayer !== 'undefined' && drawLayer) {
        drawLayer.setVisible(true);
        drawLayer.setZIndex(1200);
    }

    alert('圆选查询已开启：第一次左键单击确定圆心，移动鼠标预览圆形范围，第二次左键单击确认查询。');

    // 第一次左键：确定圆心
    // 第二次左键：确认半径并查询
    circleSelectClickKey = map.on('singleclick', function(evt) {
        const currentCoord = evt.coordinate;

        // 第一次点击：确定圆心
        if (!circleSelectStartCoord) {
            circleSelectStartCoord = currentCoord;

            circleSelectFeature = new ol.Feature({
                geometry: createCircleSelectGeodesicCircle(circleSelectStartCoord, 1, 64)
            });

            circleSelectFeature.setProperties({
                type: 'circle_select',
                createdAt: new Date().toISOString()
            });

            circleSelectFeature.setStyle(new ol.style.Style({
                fill: new ol.style.Fill({
                    color: 'rgba(0, 123, 255, 0.15)'
                }),
                stroke: new ol.style.Stroke({
                    color: '#007bff',
                    width: 3,
                    lineDash: [8, 6]
                })
            }));

            drawSource.addFeature(circleSelectFeature);

            return;
        }

        // 第二次点击：确认圆形范围
        const radiusMeters = ol.sphere.getDistance(
            circleSelectStartCoord,
            currentCoord,
            6371008.8
        );

        if (radiusMeters <= 0) {
            alert('圆选范围太小，请重新选择。');

            if (circleSelectFeature) {
                drawSource.removeFeature(circleSelectFeature);
            }

            clearCircleSelectListeners();
            return;
        }

        const finalCirclePolygon = createCircleSelectGeodesicCircle(
            circleSelectStartCoord,
            radiusMeters,
            128
        );

        if (circleSelectFeature) {
            circleSelectFeature.setGeometry(finalCirclePolygon);
        }

        const results = [];

        attractionsSource.getFeatures().forEach(function(feature) {
            const geometry = feature.getGeometry();

            if (!geometry) {
                return;
            }

            const coord = geometry.getCoordinates();

            const distanceMeters = ol.sphere.getDistance(
                circleSelectStartCoord,
                coord,
                6371008.8
            );

            if (distanceMeters <= radiusMeters) {
                results.push(feature);
            }
        });

        showSpatialQueryResult('圆选查询结果', results);

        clearCircleSelectListeners();

        alert('圆选查询完成，共查询到 ' + results.length + ' 个景点。');
});

    // 鼠标移动：动态预览圆形范围
    circleSelectMoveKey = map.on('pointermove', function(evt) {
        if (!circleSelectStartCoord || !circleSelectFeature) {
            return;
        }

        const currentCoord = evt.coordinate;

        const radiusMeters = ol.sphere.getDistance(
            circleSelectStartCoord,
            currentCoord,
            6371008.8
        );

        const previewCirclePolygon = createCircleSelectGeodesicCircle(
            circleSelectStartCoord,
            radiusMeters,
            96
        );

        circleSelectFeature.setGeometry(previewCirclePolygon);
    });
}

// 清除空间查询范围要素
// 只清除框选、圆选、多边形查询产生的范围，不清除用户普通绘制内容
function clearSpatialQueryRangeFeatures() {
    if (typeof drawSource === 'undefined' || !drawSource) {
        return;
    }

    const queryTypes = [
        'box_select',
        'circle_select',
        'polygon_select',
        'spatial_query'
    ];

    const featuresToRemove = [];

    drawSource.getFeatures().forEach(function(feature) {
        const featureType = feature.get('type');

        if (queryTypes.includes(featureType)) {
            featuresToRemove.push(feature);
        }
    });

    featuresToRemove.forEach(function(feature) {
        drawSource.removeFeature(feature);
    });

    // 顺手清空相关临时变量，避免下次查询受影响
    if (typeof boxSelectFeature !== 'undefined') {
        boxSelectFeature = null;
    }

    if (typeof circleSelectFeature !== 'undefined') {
        circleSelectFeature = null;
    }

    if (typeof polygonSelectFeature !== 'undefined') {
        polygonSelectFeature = null;
    }

    if (typeof twoClickQueryFeature !== 'undefined') {
        twoClickQueryFeature = null;
    }
}

// ===== 景点类别统一整理 =====
// 1. 西湖、黄山、桂林山水、九寨沟、鼓浪屿归类为“自然风光”
// 2. 长城、丽江古城归类为“文化景区”
// 3. 原“名山大川”统一改为“自然风光”
// 4. 没有类别的景点统一归类为“文化景区”
function normalizeAttractionCategories() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    const natureAttractions = [
        '西湖',
        '黄山',
        '桂林山水',
        '九寨沟',
        '鼓浪屿'
    ];

    const culturalAttractions = [
        '长城',
        '万里长城',
        '丽江古城'
    ];

    attractionsSource.getFeatures().forEach(function(feature) {
        const name = (
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            ''
        ).trim();

        let category = feature.get('category');

        if (typeof category === 'string') {
            category = category.trim();
        }

        // 长城、丽江古城强制归类为文化景区
        const isCulturalAttraction = culturalAttractions.some(function(item) {
            return name.indexOf(item) !== -1;
        });

        if (isCulturalAttraction) {
            feature.set('category', '文化景区');
            return;
        }

        // 指定自然风光类景点
        const isNatureAttraction = natureAttractions.some(function(item) {
            return name.indexOf(item) !== -1;
        });

        if (isNatureAttraction) {
            feature.set('category', '自然风光');
            return;
        }

        // 原来的“名山大川”统一改为“自然风光”
        if (category === '名山大川') {
            feature.set('category', '自然风光');
            return;
        }

        // 没有类别的景点统一改为“文化景区”
        if (!category || category === '未分类' || category === '其他') {
            feature.set('category', '文化景区');
        }
    });
}

// 页面加载后执行一次类别整理
setTimeout(function() {
    normalizeAttractionCategories();
}, 1000);

// 再延迟执行一次，防止景点数据加载较慢
setTimeout(function() {
    normalizeAttractionCategories();
}, 2500);

// ===============================
// 业务拓展功能：智能推荐 / 主题路线 / 热度排行 / 文创建议 / 服务圈分析
// ===============================

// 初始化业务拓展图层
(function initBusinessExpansionLayer() {
    if (!window.businessExpansionSource) {
        window.businessExpansionSource = new ol.source.Vector();
    }

    if (!window.businessExpansionLayer) {
        window.businessExpansionLayer = new ol.layer.Vector({
            source: window.businessExpansionSource,
            zIndex: 1500,
            style: function(feature) {
                const type = feature.get('businessType');
                const label = feature.get('label') || '';

                if (type === 'theme_route_line') {
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#b22126',
                            width: 4,
                            lineDash: [10, 8]
                        })
                    });
                }

                if (type === 'service_circle') {
                    return new ol.style.Style({
                        fill: new ol.style.Fill({
                            color: 'rgba(0, 123, 255, 0.16)'
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#007bff',
                            width: 3,
                            lineDash: [8, 6]
                        })
                    });
                }

                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 11,
                        fill: new ol.style.Fill({
                            color: 'rgba(178, 33, 38, 0.92)'
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 3
                        })
                    }),
                    text: new ol.style.Text({
                        text: label,
                        fill: new ol.style.Fill({
                            color: '#ffffff'
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#8b1a1a',
                            width: 2
                        }),
                        font: 'bold 13px Microsoft YaHei'
                    })
                });
            }
        });

        map.addLayer(window.businessExpansionLayer);
    }
})();


// 统一景点类别
function normalizeAttractionCategories() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    const natureAttractions = [
        '西湖',
        '黄山',
        '桂林山水',
        '九寨沟',
        '鼓浪屿'
    ];

    const culturalAttractions = [
        '长城',
        '万里长城',
        '丽江古城'
    ];

    attractionsSource.getFeatures().forEach(function(feature) {
        const name = (
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            ''
        ).trim();

        let category = feature.get('category');

        if (typeof category === 'string') {
            category = category.trim();
        }

        const isCulturalAttraction = culturalAttractions.some(function(item) {
            return name.indexOf(item) !== -1;
        });

        if (isCulturalAttraction) {
            feature.set('category', '文化景区');
            return;
        }

        const isNatureAttraction = natureAttractions.some(function(item) {
            return name.indexOf(item) !== -1;
        });

        if (isNatureAttraction) {
            feature.set('category', '自然风光');
            return;
        }

        if (category === '名山大川') {
            feature.set('category', '自然风光');
            return;
        }

        if (!category || category === '未分类' || category === '其他') {
            feature.set('category', '文化景区');
        }
    });
}


// 获取景点名称
function getAttractionName(feature) {
    return (
        feature.get('name') ||
        feature.get('title') ||
        feature.get('名称') ||
        '未命名景点'
    );
}


// 获取景点类别
function getAttractionCategory(feature) {
    return feature.get('category') || '文化景区';
}

// 获取景点评分：统一随机分配在 4.5 - 5.0 之间
function getAttractionRating(feature) {
    // 如果已经分配过随机评分，直接返回，避免同一景点反复变化
    let rating = Number(feature.get('randomRating'));

    if (!isNaN(rating) && rating >= 4.5 && rating <= 5.0) {
        return rating;
    }

    // 在 4.5 ~ 5.0 之间随机生成评分，保留 1 位小数
    rating = Number((4.5 + Math.random() * 0.5).toFixed(1));

    // 写回要素属性，保证当前页面内该景点评分固定
    feature.set('randomRating', rating);

    return rating;
}


// 获取模拟热度
function getAttractionHeat(feature) {
    const rating = getAttractionRating(feature);
    const name = getAttractionName(feature);
    const category = getAttractionCategory(feature);

    let categoryBonus = 0;

    if (category === '文化景区') categoryBonus = 8;
    if (category === '历史遗址') categoryBonus = 7;
    if (category === '古建筑') categoryBonus = 6;
    if (category === '自然风光') categoryBonus = 6;
    if (category === '园林') categoryBonus = 5;

    return Math.round(rating * 18 + categoryBonus + (name.length % 10));
}


// 转义 HTML，避免特殊字符影响页面
function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}


// 获取全部景点要素
function getAllAttractionFeatures() {
    normalizeAttractionCategories();

    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return [];
    }

    return attractionsSource.getFeatures().filter(function(feature) {
        return feature.getGeometry();
    });
}


// 在弹窗里显示业务分析结果
function showBusinessResult(title, html) {
    const featureInfo = document.getElementById('featureInfo');

    if (!featureInfo) {
        alert(title);
        return;
    }

    featureInfo.innerHTML = `
        <h6 style="color:#b22126;font-weight:bold;margin-bottom:10px;">${title}</h6>
        ${html}
    `;

    if (typeof showInfoPanel === 'function') {
        showInfoPanel();
    }
}


function clearBusinessExpansionLayer() {
    if (window.businessExpansionSource) {
        window.businessExpansionSource.clear();
    }

    clearOverlayAnalysisResult();
}


// 定位业务拓展图层
function fitBusinessExpansionLayer() {
    if (!window.businessExpansionSource) {
        return;
    }

    const extent = window.businessExpansionSource.getExtent();

    if (!ol.extent.isEmpty(extent)) {
        map.getView().fit(extent, {
            padding: [90, 430, 90, 280],
            duration: 800,
            maxZoom: 8
        });
    }
}


// 高亮一组景点
function drawBusinessHighlightPoints(features, useRankLabel) {
    clearBusinessExpansionLayer();

    features.forEach(function(feature, index) {
        const geometry = feature.getGeometry();

        if (!geometry) {
            return;
        }

        const pointFeature = new ol.Feature({
            geometry: new ol.geom.Point(geometry.getCoordinates())
        });

        pointFeature.setProperties({
            businessType: 'business_point',
            label: useRankLabel ? String(index + 1) : ''
        });

        window.businessExpansionSource.addFeature(pointFeature);
    });

    fitBusinessExpansionLayer();
}


// 计算到当前地图中心的距离
function getDistanceFromMapCenter(feature) {
    const center = map.getView().getCenter();
    const coord = feature.getGeometry().getCoordinates();

    return ol.sphere.getDistance(center, coord, 6371008.8);
}


// 智能景点推荐
function generateSmartRecommendation() {
    const preference = document.getElementById('recommendPreference').value;
    const mode = document.getElementById('recommendMode').value;

    let features = getAllAttractionFeatures();

    if (features.length === 0) {
        alert('当前没有可推荐的景点数据。');
        return;
    }

    if (preference === 'history') {
        features = features.filter(function(feature) {
            const category = getAttractionCategory(feature);
            return ['历史遗址', '古建筑', '文化景区'].includes(category);
        });
    }

    if (preference === 'nature') {
        features = features.filter(function(feature) {
            return getAttractionCategory(feature) === '自然风光';
        });
    }

    if (preference === 'ancient') {
        features = features.filter(function(feature) {
            const category = getAttractionCategory(feature);
            return ['古建筑', '园林', '文化景区'].includes(category);
        });
    }

    if (features.length === 0) {
        features = getAllAttractionFeatures();
    }

    if (mode === 'rating') {
        features.sort(function(a, b) {
            return getAttractionRating(b) - getAttractionRating(a);
        });
    }

    if (mode === 'heat') {
        features.sort(function(a, b) {
            return getAttractionHeat(b) - getAttractionHeat(a);
        });
    }

    if (mode === 'distance') {
        features.sort(function(a, b) {
            return getDistanceFromMapCenter(a) - getDistanceFromMapCenter(b);
        });
    }

    const topFeatures = features.slice(0, 6);

    drawBusinessHighlightPoints(topFeatures, true);

    const modeTextMap = {
        rating: '评分',
        heat: '热度',
        distance: '与当前地图中心距离'
    };

    let html = `
        <p>系统已根据偏好和 <strong>${modeTextMap[mode]}</strong> 生成推荐结果，地图中已用编号高亮推荐景点。</p>
        <ol>
    `;

    topFeatures.forEach(function(feature) {
        const name = getAttractionName(feature);
        const category = getAttractionCategory(feature);
        const rating = getAttractionRating(feature).toFixed(1);
        const heat = getAttractionHeat(feature);

        let reason = `类别为${category}，评分：${getRatingDisplay(feature)}，综合热度 ${heat}`;

        if (mode === 'distance') {
            const distanceKm = getDistanceFromMapCenter(feature) / 1000;
            reason = `距离当前地图中心约 ${distanceKm.toFixed(1)} 千米，适合就近游览`;
        }

        html += `
            <li>
                <strong>${escapeHtml(name)}</strong><br>
                <span>类别：${escapeHtml(category)}；${reason}</span>
            </li>
        `;
    });

    html += `
        </ol>
        <p style="font-size:13px;color:#666;">说明：该推荐综合利用景点类别、评分、模拟热度和空间位置进行排序，可作为游客出行辅助决策。</p>
    `;

    showBusinessResult('智能景点推荐', html);
}


// 根据名称查找景点
function findAttractionByKeywords(keywords) {
    const features = getAllAttractionFeatures();

    return features.find(function(feature) {
        const name = getAttractionName(feature);

        return keywords.some(function(keyword) {
            return name.indexOf(keyword) !== -1;
        });
    });
}


// 按类别补充路线景点
function supplementRouteByCategories(existingFeatures, categories, count) {
    const allFeatures = getAllAttractionFeatures();

    allFeatures.forEach(function(feature) {
        if (existingFeatures.length >= count) {
            return;
        }

        const exists = existingFeatures.some(function(item) {
            return getAttractionName(item) === getAttractionName(feature);
        });

        if (!exists && categories.includes(getAttractionCategory(feature))) {
            existingFeatures.push(feature);
        }
    });

    return existingFeatures;
}


// 主题游览路线推荐
function recommendThemeRoute(routeType) {
    clearBusinessExpansionLayer();

    const routeConfig = {
        history: {
            title: '历史文化路线',
            description: '适合关注历史遗产、文化记忆和城市文明脉络的游客。',
            keywords: [
                ['故宫'],
                ['长城', '万里长城'],
                ['平遥'],
                ['丽江古城']
            ],
            categories: ['历史遗址', '古建筑', '文化景区']
        },
        nature: {
            title: '自然风光路线',
            description: '适合偏好山水景观、自然生态和休闲观光的游客。',
            keywords: [
                ['西湖'],
                ['黄山'],
                ['桂林'],
                ['九寨沟'],
                ['鼓浪屿']
            ],
            categories: ['自然风光']
        },
        ancient: {
            title: '古城园林路线',
            description: '适合体验古城街巷、传统建筑和园林美学的游客。',
            keywords: [
                ['平遥'],
                ['丽江古城'],
                ['苏州园林'],
                ['鼓浪屿']
            ],
            categories: ['古建筑', '园林', '文化景区']
        }
    };

    const config = routeConfig[routeType];

    if (!config) {
        alert('没有找到对应主题路线。');
        return;
    }

    let routeFeatures = [];

    config.keywords.forEach(function(keywordGroup) {
        const feature = findAttractionByKeywords(keywordGroup);

        if (feature) {
            const exists = routeFeatures.some(function(item) {
                return getAttractionName(item) === getAttractionName(feature);
            });

            if (!exists) {
                routeFeatures.push(feature);
            }
        }
    });

    routeFeatures = supplementRouteByCategories(routeFeatures, config.categories, 5);

    if (routeFeatures.length < 2) {
        alert('当前景点数据不足，无法生成主题路线。');
        return;
    }

    const coordinates = routeFeatures.map(function(feature) {
        return feature.getGeometry().getCoordinates();
    });

    const lineFeature = new ol.Feature({
        geometry: new ol.geom.LineString(coordinates)
    });

    lineFeature.setProperties({
        businessType: 'theme_route_line'
    });

    window.businessExpansionSource.addFeature(lineFeature);

    routeFeatures.forEach(function(feature, index) {
        const pointFeature = new ol.Feature({
            geometry: new ol.geom.Point(feature.getGeometry().getCoordinates())
        });

        pointFeature.setProperties({
            businessType: 'theme_route_point',
            label: String(index + 1)
        });

        window.businessExpansionSource.addFeature(pointFeature);
    });

    fitBusinessExpansionLayer();

    let html = `
        <p>${config.description}</p>
        <p>地图中红色虚线表示推荐游览路线，编号表示游览顺序。</p>
        <ol>
    `;

    routeFeatures.forEach(function(feature) {
        html += `
            <li>
                <strong>${escapeHtml(getAttractionName(feature))}</strong>
                <br>
                <span>类别：${escapeHtml(getAttractionCategory(feature))}；评分：${getAttractionRating(feature).toFixed(1)}</span>
            </li>
        `;
    });

    html += `
        </ol>
        <p style="font-size:13px;color:#666;">说明：该路线为主题化游览建议，适合作为文旅导览和课程展示中的业务拓展功能。</p>
    `;

    showBusinessResult(config.title, html);
}


// 景点热度排行榜
function showHotRanking() {
    const features = getAllAttractionFeatures();

    if (features.length === 0) {
        alert('当前没有景点数据。');
        return;
    }

    features.sort(function(a, b) {
        return getAttractionHeat(b) - getAttractionHeat(a);
    });

    const topFeatures = features.slice(0, 10);

    drawBusinessHighlightPoints(topFeatures, true);

    let html = `
        <p>系统根据评分、类别权重和模拟游客关注度生成热度排行榜，地图中已标注排名。</p>
        <ol>
    `;

    topFeatures.forEach(function(feature) {
        html += `
            <li>
                <strong>${escapeHtml(getAttractionName(feature))}</strong>
                <br>
                <span>类别：${escapeHtml(getAttractionCategory(feature))}；热度：${getAttractionHeat(feature)}；评分：${getAttractionRating(feature).toFixed(1)}</span>
            </li>
        `;
    });

    html += `
        </ol>
    `;

    showBusinessResult('景点热度排行榜', html);
}


// 文创开发建议规则
function getCulturalCreativeAdvice(feature) {
    const name = getAttractionName(feature);
    const category = getAttractionCategory(feature);

    if (name.indexOf('故宫') !== -1) {
        return '适合开发宫廷文化 IP、书签、手账、冰箱贴、数字藏品和传统纹样周边。';
    }

    if (name.indexOf('长城') !== -1) {
        return '适合开发历史纪念类文创、徽章、模型摆件、登城打卡纪念产品。';
    }

    if (name.indexOf('西湖') !== -1) {
        return '适合开发山水明信片、香薰、茶具、摄影纪念品和城市礼物。';
    }

    if (name.indexOf('黄山') !== -1 || name.indexOf('桂林') !== -1 || name.indexOf('九寨沟') !== -1) {
        return '适合开发自然风光摄影集、户外纪念品、生态主题文创和风景插画产品。';
    }

    if (name.indexOf('丽江') !== -1 || name.indexOf('平遥') !== -1) {
        return '适合开发古城街巷地图、民族风手账、特色伴手礼和城市 IP 周边。';
    }

    if (name.indexOf('苏州园林') !== -1) {
        return '适合开发园林美学香薰、茶具、折扇、窗棂纹样文创和东方生活美学产品。';
    }

    if (category === '历史遗址') {
        return '适合开发历史纪念类产品、考古主题文创、研学手册和纪念徽章。';
    }

    if (category === '古建筑') {
        return '适合开发建筑模型、明信片、传统纹样插画和结构科普类文创。';
    }

    if (category === '自然风光') {
        return '适合开发摄影明信片、生态纪念品、户外旅行周边和自然主题插画。';
    }

    if (category === '园林') {
        return '适合开发园林美学、茶具、香薰、折扇和东方生活方式类文创。';
    }

    return '适合结合城市文化 IP，开发特色伴手礼、文旅地图、打卡纪念品和数字互动产品。';
}


// 文创开发建议
function showCulturalCreativeAnalysis() {
    const features = getAllAttractionFeatures();

    if (features.length === 0) {
        alert('当前没有景点数据。');
        return;
    }

    features.sort(function(a, b) {
        return getAttractionHeat(b) - getAttractionHeat(a);
    });

    const topFeatures = features.slice(0, 8);

    drawBusinessHighlightPoints(topFeatures, true);

    let html = `
        <p>系统根据景点类型和文化资源特征，生成文创开发方向建议。</p>
        <ol>
    `;

    topFeatures.forEach(function(feature) {
        html += `
            <li>
                <strong>${escapeHtml(getAttractionName(feature))}</strong>
                <br>
                <span>类别：${escapeHtml(getAttractionCategory(feature))}</span>
                <br>
                <span>${escapeHtml(getCulturalCreativeAdvice(feature))}</span>
            </li>
        `;
    });

    html += `
        </ol>
        <hr>
        <p><strong>总体建议：</strong></p>
        <p style="font-size:13px;">
            历史文化类景点适合开发纪念、研学和传统纹样产品；
            自然风光类景点适合开发摄影、生态和休闲旅行产品；
            古城园林类景点适合开发城市 IP、生活美学和特色伴手礼。
        </p>
    `;

    showBusinessResult('文创开发建议', html);
}


// 生成真实地理圆
function createBusinessGeodesicCircle(centerCoord, radiusMeters, points) {
    const lon = centerCoord[0] * Math.PI / 180;
    const lat = centerCoord[1] * Math.PI / 180;
    const earthRadius = 6371008.8;
    const angularDistance = radiusMeters / earthRadius;
    const coordinates = [];

    for (let i = 0; i <= points; i++) {
        const bearing = 2 * Math.PI * i / points;

        const destLat = Math.asin(
            Math.sin(lat) * Math.cos(angularDistance) +
            Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing)
        );

        const destLon = lon + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
            Math.cos(angularDistance) - Math.sin(lat) * Math.sin(destLat)
        );

        coordinates.push([
            destLon * 180 / Math.PI,
            destLat * 180 / Math.PI
        ]);
    }

    return new ol.geom.Polygon([coordinates]);
}


// 游客服务圈分析
function startServiceCircleAnalysis() {
    const radiusInput = prompt('请输入游客服务圈半径，单位：千米', '100');

    if (radiusInput === null) {
        return;
    }

    const radiusKm = Number(radiusInput);

    if (isNaN(radiusKm) || radiusKm <= 0) {
        alert('请输入正确的半径数值。');
        return;
    }

    alert('游客服务圈分析已开启：请在地图上单击一个景点作为服务圈中心。');

    map.once('singleclick', function(evt) {
        const selectedFeature = map.forEachFeatureAtPixel(
            evt.pixel,
            function(feature, layer) {
                if (layer === attractionsLayer) {
                    return feature;
                }

                return null;
            },
            {
                hitTolerance: 10
            }
        );

        if (!selectedFeature) {
            alert('没有选中景点，请重新点击“游客服务圈分析”，并单击地图上的景点标记。');
            return;
        }

        clearBusinessExpansionLayer();

        const centerCoord = selectedFeature.getGeometry().getCoordinates();
        const radiusMeters = radiusKm * 1000;

        const circleFeature = new ol.Feature({
            geometry: createBusinessGeodesicCircle(centerCoord, radiusMeters, 128)
        });

        circleFeature.setProperties({
            businessType: 'service_circle'
        });

        window.businessExpansionSource.addFeature(circleFeature);

        const centerPoint = new ol.Feature({
            geometry: new ol.geom.Point(centerCoord)
        });

        centerPoint.setProperties({
            businessType: 'business_point',
            label: '中'
        });

        window.businessExpansionSource.addFeature(centerPoint);

        const nearbyFeatures = [];

        getAllAttractionFeatures().forEach(function(feature) {
            const coord = feature.getGeometry().getCoordinates();

            const distanceMeters = ol.sphere.getDistance(
                centerCoord,
                coord,
                6371008.8
            );

            if (distanceMeters <= radiusMeters) {
                nearbyFeatures.push({
                    feature: feature,
                    distanceKm: distanceMeters / 1000
                });
            }
        });

        nearbyFeatures.sort(function(a, b) {
            return a.distanceKm - b.distanceKm;
        });

        nearbyFeatures.forEach(function(item, index) {
            if (index === 0) {
                return;
            }

            const pointFeature = new ol.Feature({
                geometry: new ol.geom.Point(item.feature.getGeometry().getCoordinates())
            });

            pointFeature.setProperties({
                businessType: 'business_point',
                label: String(index)
            });

            window.businessExpansionSource.addFeature(pointFeature);
        });

        fitBusinessExpansionLayer();

        const centerName = getAttractionName(selectedFeature);

        let suggestion = '';

        if (nearbyFeatures.length >= 5) {
            suggestion = '该区域景点集聚度较高，适合开发一日游或两日游联动线路，并可建设区域文旅服务中心。';
        } else if (nearbyFeatures.length >= 3) {
            suggestion = '该区域具备一定联动游览潜力，可设计短途主题路线和区域打卡活动。';
        } else {
            suggestion = '该区域景点分布较分散，适合突出单点特色，结合周边交通和服务设施进行提升。';
        }

        let html = `
            <p>服务圈中心：<strong>${escapeHtml(centerName)}</strong></p>
            <p>分析半径：<strong>${radiusKm} 千米</strong></p>
            <p>范围内景点数量：<strong>${nearbyFeatures.length}</strong></p>
            <p><strong>业务判断：</strong>${suggestion}</p>
            <hr>
            <ol>
        `;

        nearbyFeatures.forEach(function(item) {
            html += `
                <li>
                    <strong>${escapeHtml(getAttractionName(item.feature))}</strong>
                    <br>
                    <span>类别：${escapeHtml(getAttractionCategory(item.feature))}；距离中心约 ${item.distanceKm.toFixed(1)} 千米</span>
                </li>
            `;
        });

        html += `
            </ol>
        `;

        showBusinessResult('游客服务圈分析', html);
    });
}


// 页面加载后延迟整理一次类别
setTimeout(function() {
    normalizeAttractionCategories();
}, 1000);

setTimeout(function() {
    normalizeAttractionCategories();
}, 2500);

// 根据评分生成星级显示
function getRatingStars(rating) {
    rating = Number(rating);

    if (isNaN(rating)) {
        rating = 4.5;
    }

    // 5.0 显示五星，其余 4.5 - 4.9 显示四星半效果
    if (rating >= 5.0) {
        return '★★★★★';
    }

    return '★★★★☆';
}

// 统一生成评分文字
function getRatingDisplay(feature) {
    const rating = getAttractionRating(feature);
    const stars = getRatingStars(rating);

    return stars + ' ' + rating.toFixed(1) + ' 分';
}

// ===== 统一随机分配景点评分：4.5 - 5.0 =====
function assignRandomRatingsToAttractions() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    attractionsSource.getFeatures().forEach(function(feature) {
        // 如果已经分配过，就不重复分配，避免每次查询都变
        if (feature.get('randomRatingAssigned')) {
            return;
        }

        const rating = Number((4.5 + Math.random() * 0.5).toFixed(1));

        // 同时写入 rating、score、评分，兼容项目里不同地方的读取方式
        feature.set('rating', rating);
        feature.set('score', rating);
        feature.set('评分', rating);
        feature.set('randomRating', rating);
        feature.set('randomRatingAssigned', true);
    });
}

// 页面加载后执行，防止景点数据还没加载完成，所以多执行几次
setTimeout(assignRandomRatingsToAttractions, 800);
setTimeout(assignRandomRatingsToAttractions, 1500);
setTimeout(assignRandomRatingsToAttractions, 3000);

// ===============================
// 进一步业务创新功能：游览计划 / 景点对比 / 承载压力 / 价值评价 / 成本估算
// ===============================


// 根据主题获取路线配置
function getThemeRouteConfig(routeType) {
    const configs = {
        history: {
            title: '历史文化路线',
            preferenceText: '历史文化偏好',
            description: '该路线重点突出历史遗产、古城文化和城市文明记忆，适合研学游客、文化旅游游客和亲子家庭。',
            keywords: [
                ['故宫'],
                ['长城', '万里长城'],
                ['平遥'],
                ['丽江古城']
            ],
            categories: ['历史遗址', '古建筑', '文化景区']
        },
        nature: {
            title: '自然风光路线',
            preferenceText: '自然风光偏好',
            description: '该路线重点突出山水景观、自然生态和休闲观光体验，适合摄影游客、休闲游客和生态旅游游客。',
            keywords: [
                ['西湖'],
                ['黄山'],
                ['桂林'],
                ['九寨沟'],
                ['鼓浪屿']
            ],
            categories: ['自然风光']
        },
        ancient: {
            title: '古城园林路线',
            preferenceText: '古城园林偏好',
            description: '该路线重点突出古城街巷、传统建筑和园林美学，适合慢旅行游客、城市文化体验游客和文创消费游客。',
            keywords: [
                ['平遥'],
                ['丽江古城'],
                ['苏州园林'],
                ['鼓浪屿']
            ],
            categories: ['古建筑', '园林', '文化景区']
        },
        all: {
            title: '综合文旅路线',
            preferenceText: '综合偏好',
            description: '该路线综合考虑文化价值、自然景观、游客热度和文创潜力，适合首次了解名城文旅资源的用户。',
            keywords: [
                ['故宫'],
                ['长城', '万里长城'],
                ['西湖'],
                ['黄山'],
                ['丽江古城']
            ],
            categories: ['历史遗址', '古建筑', '文化景区', '自然风光', '园林']
        }
    };

    return configs[routeType] || configs.all;
}


// 根据关键词查找景点
function findAttractionByKeywordGroup(keywordGroup) {
    const features = getAllAttractionFeatures();

    return features.find(function(feature) {
        const name = getAttractionName(feature);

        return keywordGroup.some(function(keyword) {
            return name.indexOf(keyword) !== -1;
        });
    });
}


// 按主题生成路线景点
function getThemeRouteFeatures(routeType, maxCount) {
    const config = getThemeRouteConfig(routeType);
    let routeFeatures = [];

    config.keywords.forEach(function(keywordGroup) {
        const feature = findAttractionByKeywordGroup(keywordGroup);

        if (feature) {
            const exists = routeFeatures.some(function(item) {
                return getAttractionName(item) === getAttractionName(feature);
            });

            if (!exists) {
                routeFeatures.push(feature);
            }
        }
    });

    const allFeatures = getAllAttractionFeatures();

    allFeatures
        .filter(function(feature) {
            return config.categories.includes(getAttractionCategory(feature));
        })
        .sort(function(a, b) {
            return getAttractionHeat(b) - getAttractionHeat(a);
        })
        .forEach(function(feature) {
            if (routeFeatures.length >= maxCount) {
                return;
            }

            const exists = routeFeatures.some(function(item) {
                return getAttractionName(item) === getAttractionName(feature);
            });

            if (!exists) {
                routeFeatures.push(feature);
            }
        });

    return routeFeatures.slice(0, maxCount);
}


// 计算路线总距离
function calculateRouteDistanceKm(features) {
    let totalMeters = 0;

    for (let i = 0; i < features.length - 1; i++) {
        const coord1 = features[i].getGeometry().getCoordinates();
        const coord2 = features[i + 1].getGeometry().getCoordinates();

        totalMeters += ol.sphere.getDistance(coord1, coord2, 6371008.8);
    }

    return totalMeters / 1000;
}


// 绘制路线和编号点
function drawBusinessRoute(features) {
    clearBusinessExpansionLayer();

    if (!features || features.length === 0) {
        return;
    }

    const coords = features.map(function(feature) {
        return feature.getGeometry().getCoordinates();
    });

    if (coords.length >= 2) {
        const lineFeature = new ol.Feature({
            geometry: new ol.geom.LineString(coords)
        });

        lineFeature.setProperties({
            businessType: 'theme_route_line'
        });

        window.businessExpansionSource.addFeature(lineFeature);
    }

    features.forEach(function(feature, index) {
        const pointFeature = new ol.Feature({
            geometry: new ol.geom.Point(feature.getGeometry().getCoordinates())
        });

        pointFeature.setProperties({
            businessType: 'theme_route_point',
            label: String(index + 1)
        });

        window.businessExpansionSource.addFeature(pointFeature);
    });

    fitBusinessExpansionLayer();
}


// 根据偏好筛选景点
function filterFeaturesByPreference(preference) {
    let features = getAllAttractionFeatures();

    if (preference === 'history') {
        features = features.filter(function(feature) {
            return ['历史遗址', '古建筑', '文化景区'].includes(getAttractionCategory(feature));
        });
    }

    if (preference === 'nature') {
        features = features.filter(function(feature) {
            return getAttractionCategory(feature) === '自然风光';
        });
    }

    if (preference === 'ancient') {
        features = features.filter(function(feature) {
            return ['古建筑', '园林', '文化景区'].includes(getAttractionCategory(feature));
        });
    }

    if (features.length === 0) {
        features = getAllAttractionFeatures();
    }

    features.sort(function(a, b) {
        return getAttractionHeat(b) - getAttractionHeat(a);
    });

    return features;
}


// 一键生成游览计划
function generateTravelPlan() {
    const duration = document.getElementById('travelPlanDuration').value;
    const preference = document.getElementById('travelPlanPreference').value;

    const durationConfig = {
        half: {
            title: '半日游计划',
            count: 2,
            intensity: '较低',
            timeAdvice: '适合时间有限、希望轻量体验的游客，建议选择交通较便利、游览节奏较舒适的景点组合。'
        },
        one: {
            title: '一日游计划',
            count: 3,
            intensity: '中等',
            timeAdvice: '适合普通游客的一日游安排，建议上午安排核心景点，下午安排体验型或观光型景点。'
        },
        two: {
            title: '两日游计划',
            count: 5,
            intensity: '较高',
            timeAdvice: '适合深度游览游客，可以将文化体验、自然观光和文创消费结合起来，形成较完整的文旅体验。'
        }
    };

    const preferenceConfig = getThemeRouteConfig(preference);
    const config = durationConfig[duration];

    let features = getThemeRouteFeatures(preference, config.count);

    if (features.length < config.count) {
        features = filterFeaturesByPreference(preference).slice(0, config.count);
    }

    if (features.length === 0) {
        alert('当前没有可用于生成计划的景点数据。');
        return;
    }

    drawBusinessRoute(features);

    const totalDistanceKm = calculateRouteDistanceKm(features);
    const planTitle = config.title + '：' + preferenceConfig.preferenceText;

    let html = `
        <p><strong>计划类型：</strong>${config.title}</p>
        <p><strong>偏好方向：</strong>${preferenceConfig.preferenceText}</p>
        <p><strong>推荐理由：</strong>${preferenceConfig.description} 系统综合考虑了景点类别、评分、热度和空间位置，优先选择代表性较强、展示价值较高、适合课程演示的景点。</p>
        <p><strong>整体建议：</strong>${config.timeAdvice}</p>
        <p><strong>预计路线距离：</strong>约 ${totalDistanceKm.toFixed(1)} 千米</p>
        <p><strong>游览强度：</strong>${config.intensity}</p>
        <hr>
    `;

    if (duration === 'half') {
        html += `
            <p><strong>半日游安排：</strong></p>
            <ol>
                <li>
                    <strong>第一站：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    推荐作为核心游览点。该景点热度较高，文化或景观识别度较强，适合在有限时间内快速形成游览记忆点。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>第二站：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    推荐作为补充体验点。该景点可以与第一站形成主题补充，适合用于拍照打卡、休闲游览或文创消费延伸。
                </li>
            `;
        }

        html += `</ol>`;
    }

    if (duration === 'one') {
        html += `
            <p><strong>一日游安排：</strong></p>
            <ol>
                <li>
                    <strong>上午：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    上午适合安排代表性最强的核心景点，游客体力较好，适合进行深度参观、文化讲解和研学体验。
                </li>
                <li>
                    <strong>中午：交通换乘与休息</strong><br>
                    建议安排餐饮、休息和城市公共服务体验，可结合当地特色小吃、文创商店或游客服务中心。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>下午：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    下午适合安排观光体验型景点，与上午景点形成内容互补，提升路线丰富度。
                </li>
            `;
        }

        if (features[2]) {
            html += `
                <li>
                    <strong>傍晚：${escapeHtml(getAttractionName(features[2]))}</strong><br>
                    傍晚适合安排轻量游览、拍照打卡或文创消费，提升游客停留时间和消费转化。
                </li>
            `;
        }

        html += `</ol>`;
    }

    if (duration === 'two') {
        html += `
            <p><strong>两日游安排：</strong></p>
            <ol>
                <li>
                    <strong>第一天上午：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    作为第一天核心景点，适合安排重点讲解和深度游览，帮助游客建立对主题路线的整体认知。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>第一天下午：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    与上午景点形成主题衔接，适合进行补充观光、文化体验或城市漫游。
                </li>
            `;
        }

        if (features[2]) {
            html += `
                <li>
                    <strong>第一天傍晚：${escapeHtml(getAttractionName(features[2]))}</strong><br>
                    适合安排打卡、休闲和文创消费，增强游客夜间经济和城市停留体验。
                </li>
            `;
        }

        if (features[3]) {
            html += `
                <li>
                    <strong>第二天上午：${escapeHtml(getAttractionName(features[3]))}</strong><br>
                    第二天上午适合安排另一个具有代表性的景点，形成跨区域或跨主题的文旅联动。
                </li>
            `;
        }

        if (features[4]) {
            html += `
                <li>
                    <strong>第二天下午：${escapeHtml(getAttractionName(features[4]))}</strong><br>
                    作为收尾景点，适合安排休闲游览、购物体验和文创产品购买，提升路线完整度。
                </li>
            `;
        }

        html += `</ol>`;
    }

    html += `
        <hr>
        <p><strong>推荐结论：</strong></p>
        <p>
            本路线兼顾景点代表性、主题一致性和空间可达性，适合作为游客出行参考，也可以作为文旅平台进行产品设计的基础方案。
            对于管理者而言，该计划可以用于引导游客在不同景点之间合理流动，减少单一热门景点压力，并提升周边景点的联动价值。
        </p>
        <p><strong>优化建议：</strong></p>
        <p>
            后续可进一步结合实时交通、门票预约、游客画像和季节因素，对游览顺序、停留时间和消费节点进行动态优化，
            从而形成更加智能化的文旅推荐服务。
        </p>
    `;

    showBusinessResult(planTitle, html);
}


// 根据关键词查找单个景点
function findAttractionByKeyword(keyword) {
    if (!keyword) {
        return null;
    }

    const features = getAllAttractionFeatures();

    return features.find(function(feature) {
        return getAttractionName(feature).indexOf(keyword) !== -1;
    });
}


// 景点对比分析
function compareAttractions() {
    const features = getAllAttractionFeatures();

    if (features.length < 2) {
        alert('景点数据不足，无法进行对比分析。');
        return;
    }

    const input1 = prompt('请输入第一个景点关键词；留空则自动选择热度最高景点', '');
    if (input1 === null) return;

    const input2 = prompt('请输入第二个景点关键词；留空则自动选择另一个高热度景点', '');
    if (input2 === null) return;

    const sortedFeatures = features.slice().sort(function(a, b) {
        return getAttractionHeat(b) - getAttractionHeat(a);
    });

    let feature1 = findAttractionByKeyword(input1.trim()) || sortedFeatures[0];
    let feature2 = findAttractionByKeyword(input2.trim()) || sortedFeatures.find(function(item) {
        return getAttractionName(item) !== getAttractionName(feature1);
    });

    if (!feature1 || !feature2) {
        alert('没有找到可对比的景点。');
        return;
    }

    drawBusinessHighlightPoints([feature1, feature2], true);

    const value1 = calculateTourismValueIndex(feature1);
    const value2 = calculateTourismValueIndex(feature2);
    const pressure1 = getVisitorPressureInfo(feature1);
    const pressure2 = getVisitorPressureInfo(feature2);

    let betterForCulture = value1.index >= value2.index ? feature1 : feature2;
    let betterForLeisure = getAttractionCategory(feature1) === '自然风光' ? feature1 : feature2;

    if (getAttractionCategory(feature2) === '自然风光' && getAttractionCategory(feature1) !== '自然风光') {
        betterForLeisure = feature2;
    }

    const html = `
        <p>地图中已用编号 1 和 2 高亮两个对比景点。</p>

        <table class="table table-sm table-bordered">
            <thead>
                <tr>
                    <th>指标</th>
                    <th>${escapeHtml(getAttractionName(feature1))}</th>
                    <th>${escapeHtml(getAttractionName(feature2))}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>类别</td>
                    <td>${escapeHtml(getAttractionCategory(feature1))}</td>
                    <td>${escapeHtml(getAttractionCategory(feature2))}</td>
                </tr>
                <tr>
                    <td>评分</td>
                    <td>${getAttractionRating(feature1).toFixed(1)}</td>
                    <td>${getAttractionRating(feature2).toFixed(1)}</td>
                </tr>
                <tr>
                    <td>热度</td>
                    <td>${getAttractionHeat(feature1)}</td>
                    <td>${getAttractionHeat(feature2)}</td>
                </tr>
                <tr>
                    <td>承载压力</td>
                    <td>${pressure1.level}</td>
                    <td>${pressure2.level}</td>
                </tr>
                <tr>
                    <td>文旅价值指数</td>
                    <td>${value1.index.toFixed(1)}（${value1.grade}）</td>
                    <td>${value2.index.toFixed(1)}（${value2.grade}）</td>
                </tr>
            </tbody>
        </table>

        <p><strong>对比结论：</strong></p>
        <p>
            ${escapeHtml(getAttractionName(feature1))} 的优势主要体现在 ${escapeHtml(getAttractionCategory(feature1))} 资源特征上，
            ${escapeHtml(getAttractionName(feature2))} 则体现出 ${escapeHtml(getAttractionCategory(feature2))} 方面的资源价值。
            从综合文旅价值指数看，${escapeHtml(getAttractionName(betterForCulture))} 更适合作为重点展示或重点开发对象。
        </p>

        <p><strong>推荐理由：</strong></p>
        <p>
            如果游客偏好历史文化、研学教育或城市文化体验，可以优先选择文化属性更强、热度更高、文创开发潜力更大的景点；
            如果游客偏好休闲观光、拍照打卡或轻松游览，可以优先选择自然景观特征更明显、游览节奏更舒适的景点。
        </p>

        <p><strong>管理建议：</strong></p>
        <p>
            对高热度景点应加强预约、分时段入园和客流疏导；对热度相对较低但价值较高的景点，可以通过主题路线、联票产品、
            文创活动和短视频宣传进行引流，提升区域文旅资源整体利用效率。
        </p>

        <p><strong>文创建议：</strong></p>
        <p>
            ${escapeHtml(getAttractionName(feature1))}：${escapeHtml(getCulturalCreativeAdvice(feature1))}
            <br>
            ${escapeHtml(getAttractionName(feature2))}：${escapeHtml(getCulturalCreativeAdvice(feature2))}
        </p>
    `;

    showBusinessResult('景点对比分析', html);
}


// 获取游客承载压力信息
function getVisitorPressureInfo(feature) {
    const heat = getAttractionHeat(feature);

    if (heat >= 100) {
        return {
            level: '高压力',
            color: 'rgba(220, 53, 69, 0.95)',
            advice: '该景点游客关注度较高，节假日容易出现排队、拥堵和游览体验下降等问题。建议采用预约入园、分时段游览、周边景点分流和实时客流提示等措施。'
        };
    }

    if (heat >= 93) {
        return {
            level: '中压力',
            color: 'rgba(255, 193, 7, 0.95)',
            advice: '该景点具有较稳定的游客吸引力，整体承载压力适中。建议加强游览秩序维护，优化导览路线，并结合周边景点形成联动游览。'
        };
    }

    return {
        level: '低压力',
        color: 'rgba(25, 135, 84, 0.95)',
        advice: '该景点当前压力较低，具备进一步推广和引流潜力。建议通过主题活动、文创宣传、社交媒体打卡和路线组合提升游客关注度。'
    };
}


// 绘制带颜色的压力点
function drawPressurePoints(features) {
    clearBusinessExpansionLayer();

    features.forEach(function(feature, index) {
        const pressure = getVisitorPressureInfo(feature);

        const pointFeature = new ol.Feature({
            geometry: new ol.geom.Point(feature.getGeometry().getCoordinates())
        });

        pointFeature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 11,
                fill: new ol.style.Fill({
                    color: pressure.color
                }),
                stroke: new ol.style.Stroke({
                    color: '#ffffff',
                    width: 3
                })
            }),
            text: new ol.style.Text({
                text: String(index + 1),
                fill: new ol.style.Fill({
                    color: '#ffffff'
                }),
                stroke: new ol.style.Stroke({
                    color: '#333333',
                    width: 2
                }),
                font: 'bold 13px Microsoft YaHei'
            })
        }));

        window.businessExpansionSource.addFeature(pointFeature);
    });

    fitBusinessExpansionLayer();
}


// 游客承载压力预警
function showVisitorPressureWarning() {
    const features = getAllAttractionFeatures();

    if (features.length === 0) {
        alert('当前没有景点数据。');
        return;
    }

    const sortedFeatures = features.slice().sort(function(a, b) {
        return getAttractionHeat(b) - getAttractionHeat(a);
    });

    const topFeatures = sortedFeatures.slice(0, 12);

    drawPressurePoints(topFeatures);

    const highCount = topFeatures.filter(function(feature) {
        return getVisitorPressureInfo(feature).level === '高压力';
    }).length;

    const middleCount = topFeatures.filter(function(feature) {
        return getVisitorPressureInfo(feature).level === '中压力';
    }).length;

    const lowCount = topFeatures.filter(function(feature) {
        return getVisitorPressureInfo(feature).level === '低压力';
    }).length;

    let html = `
        <p>
            系统根据景点热度、评分和类别权重，对重点景点进行游客承载压力预警。
            地图中红色表示高压力，黄色表示中压力，绿色表示低压力。
        </p>

        <p>
            <strong>统计结果：</strong>
            高压力 ${highCount} 个，中压力 ${middleCount} 个，低压力 ${lowCount} 个。
        </p>

        <ol>
    `;

    topFeatures.forEach(function(feature) {
        const pressure = getVisitorPressureInfo(feature);

        html += `
            <li>
                <strong>${escapeHtml(getAttractionName(feature))}</strong>
                <br>
                <span>类别：${escapeHtml(getAttractionCategory(feature))}；热度：${getAttractionHeat(feature)}；压力等级：${pressure.level}</span>
                <br>
                <span>${escapeHtml(pressure.advice)}</span>
            </li>
        `;
    });

    html += `
        </ol>

        <hr>
        <p><strong>综合结论：</strong></p>
        <p>
            高压力景点应作为客流监测和服务保障重点，适合配置预约、限流、导览分流和应急服务；
            中压力景点适合通过优化游线提升体验；
            低压力景点则可作为热门景点的分流承接地，通过主题线路和文创活动提升吸引力。
        </p>

        <p><strong>管理建议：</strong></p>
        <p>
            建议建立“热门景点重点保障、潜力景点主动引流、周边景点联动开发”的运营策略。
            在节假日或旅游旺季，可优先将高压力景点与低压力景点组合成联动路线，既能缓解热门区域压力，也能提升冷门资源利用率。
        </p>
    `;

    showBusinessResult('游客承载压力预警', html);
}


// 文创潜力分
function getCulturalPotentialScore(feature) {
    const name = getAttractionName(feature);
    const category = getAttractionCategory(feature);

    if (name.indexOf('故宫') !== -1) return 98;
    if (name.indexOf('长城') !== -1) return 96;
    if (name.indexOf('丽江') !== -1) return 92;
    if (name.indexOf('平遥') !== -1) return 90;
    if (name.indexOf('苏州园林') !== -1) return 90;
    if (name.indexOf('西湖') !== -1) return 88;
    if (name.indexOf('鼓浪屿') !== -1) return 86;

    if (category === '历史遗址') return 88;
    if (category === '古建筑') return 86;
    if (category === '文化景区') return 84;
    if (category === '园林') return 82;
    if (category === '自然风光') return 78;

    return 75;
}


// 计算文旅资源价值指数
function calculateTourismValueIndex(feature) {
    const ratingScore = getAttractionRating(feature) / 5 * 100;
    const heatScore = Math.min(getAttractionHeat(feature), 110) / 110 * 100;
    const creativeScore = getCulturalPotentialScore(feature);

    const index = ratingScore * 0.35 + heatScore * 0.35 + creativeScore * 0.30;

    let grade = 'C级资源';

    if (index >= 90) {
        grade = 'A级资源';
    } else if (index >= 82) {
        grade = 'B级资源';
    }

    return {
        index: index,
        grade: grade,
        ratingScore: ratingScore,
        heatScore: heatScore,
        creativeScore: creativeScore
    };
}


// 文旅资源价值评价
function showTourismValueEvaluation() {
    const features = getAllAttractionFeatures();

    if (features.length === 0) {
        alert('当前没有景点数据。');
        return;
    }

    features.sort(function(a, b) {
        return calculateTourismValueIndex(b).index - calculateTourismValueIndex(a).index;
    });

    const topFeatures = features.slice(0, 10);

    drawBusinessHighlightPoints(topFeatures, true);

    let html = `
        <p>
            文旅资源价值评价综合考虑景点评分、游客热度和文创潜力三个维度。
            其中评分反映游客体验基础，热度反映市场关注程度，文创潜力反映资源转化和产业延伸能力。
        </p>

        <p><strong>评价模型：</strong></p>
        <p>
            文旅价值指数 = 评分指数 × 35% + 热度指数 × 35% + 文创潜力 × 30%。
            该模型适合用于课程项目中的辅助决策展示，不代表真实商业评估结果。
        </p>

        <ol>
    `;

    topFeatures.forEach(function(feature) {
        const value = calculateTourismValueIndex(feature);

        let advice = '';

        if (value.grade === 'A级资源') {
            advice = '建议作为重点文旅资源进行打造，可优先开发主题路线、城市 IP、研学产品和文创消费场景。';
        } else if (value.grade === 'B级资源') {
            advice = '建议作为区域联动资源进行培育，可通过活动策划、路线组合和宣传推广提升市场关注度。';
        } else {
            advice = '建议作为潜力资源进行基础服务完善，重点提升可达性、识别度和游客体验。';
        }

        html += `
            <li>
                <strong>${escapeHtml(getAttractionName(feature))}</strong>
                <br>
                <span>类别：${escapeHtml(getAttractionCategory(feature))}；价值指数：${value.index.toFixed(1)}；等级：${value.grade}</span>
                <br>
                <span>评分指数：${value.ratingScore.toFixed(1)}；热度指数：${value.heatScore.toFixed(1)}；文创潜力：${value.creativeScore}</span>
                <br>
                <span>${escapeHtml(advice)}</span>
            </li>
        `;
    });

    html += `
        </ol>

        <hr>
        <p><strong>评价结论：</strong></p>
        <p>
            A级资源具有较强的市场吸引力和文化转化能力，适合进行重点展示和深度开发；
            B级资源适合作为主题路线和区域联动中的重要节点；
            C级资源虽然当前综合表现较弱，但可以通过服务设施完善、品牌包装和活动运营进行提升。
        </p>

        <p><strong>业务建议：</strong></p>
        <p>
            文旅管理部门可以根据价值评价结果制定差异化发展策略：
            对高价值资源进行品牌化、精品化开发；
            对中等价值资源进行路线化、场景化包装；
            对潜力资源进行基础设施和传播能力提升，从而形成多层次文旅资源体系。
        </p>
    `;

    showBusinessResult('文旅资源价值评价', html);
}


// 路线成本等级
function getRouteCostLevel(distanceKm, pointCount) {
    if (distanceKm >= 1500 || pointCount >= 5) {
        return {
            level: '较高',
            advice: '路线跨度较大，交通和时间成本较高，适合深度游、长线游或跨区域旅游产品。'
        };
    }

    if (distanceKm >= 600 || pointCount >= 3) {
        return {
            level: '中等',
            advice: '路线具有一定空间跨度，适合一日游或两日游产品，需要合理安排交通换乘和休息节点。'
        };
    }

    return {
        level: '较低',
        advice: '路线空间跨度较小，游览组织成本较低，适合短途游、半日游或城市周边游。'
    };
}


// 旅游路线成本估算
function estimateThemeRouteCost() {
    const routeType = document.getElementById('routeCostType').value;
    const config = getThemeRouteConfig(routeType);
    const features = getThemeRouteFeatures(routeType, 5);

    if (features.length < 2) {
        alert('当前景点数据不足，无法进行路线成本估算。');
        return;
    }

    drawBusinessRoute(features);

    const distanceKm = calculateRouteDistanceKm(features);
    const costLevel = getRouteCostLevel(distanceKm, features.length);

    const estimatedTransportCost = distanceKm * 0.45;
    const estimatedTimeHours = Math.max(features.length * 1.5 + distanceKm / 80, 4);

    let daySuggestion = '半日游或一日游';

    if (estimatedTimeHours > 16) {
        daySuggestion = '两日游或三日游';
    } else if (estimatedTimeHours > 8) {
        daySuggestion = '一日游或两日游';
    }

    let html = `
        <p><strong>路线类型：</strong>${config.title}</p>
        <p><strong>路线说明：</strong>${config.description}</p>
        <p><strong>景点数量：</strong>${features.length} 个</p>
        <p><strong>预计空间距离：</strong>约 ${distanceKm.toFixed(1)} 千米</p>
        <p><strong>估算交通成本指数：</strong>${estimatedTransportCost.toFixed(0)}</p>
        <p><strong>预计游览与交通时间：</strong>约 ${estimatedTimeHours.toFixed(1)} 小时</p>
        <p><strong>成本等级：</strong>${costLevel.level}</p>
        <p><strong>建议游览天数：</strong>${daySuggestion}</p>

        <hr>
        <p><strong>路线节点：</strong></p>
        <ol>
    `;

    features.forEach(function(feature) {
        html += `
            <li>
                <strong>${escapeHtml(getAttractionName(feature))}</strong>
                <br>
                <span>类别：${escapeHtml(getAttractionCategory(feature))}；评分：${getAttractionRating(feature).toFixed(1)}；热度：${getAttractionHeat(feature)}</span>
            </li>
        `;
    });

    html += `
        </ol>

        <hr>
        <p><strong>成本分析结论：</strong></p>
        <p>
            ${costLevel.advice}
            本估算主要基于景点之间的空间距离、节点数量和模拟交通时间进行判断，适合作为课程项目中的路线规划辅助分析。
        </p>

        <p><strong>运营建议：</strong></p>
        <p>
            对成本较高的长线路线，可以设计为多日游产品，并增加住宿、餐饮、文创消费和地方体验内容；
            对成本中等的路线，应重点优化交通衔接和游览顺序；
            对成本较低的路线，可以包装成周末游、亲子游或城市微旅行产品。
        </p>

        <p><strong>游客建议：</strong></p>
        <p>
            若游客时间有限，建议优先选择空间距离较短、主题一致性较强的路线；
            若游客希望深度体验，则可以选择距离较长但资源类型更丰富的路线，并提前规划交通和住宿。
        </p>
    `;

    showBusinessResult('旅游路线成本估算', html);
}

// ===============================
// 城市限定版：一键生成游览计划
// 半日游 / 一日游 / 两日游优先限定在同一城市或同一区域
// ===============================


// 根据景点名称或属性判断所属城市
function getAttractionCity(feature) {
    const name = getAttractionName(feature);
    const cityProp = feature.get('city') || feature.get('城市') || feature.get('area') || feature.get('地区') || '';

    if (cityProp) {
        return cityProp;
    }

    if (name.indexOf('故宫') !== -1 || name.indexOf('长城') !== -1 || name.indexOf('天坛') !== -1 || name.indexOf('颐和园') !== -1) {
        return '北京';
    }

    if (name.indexOf('兵马俑') !== -1 || name.indexOf('大雁塔') !== -1 || name.indexOf('西安') !== -1) {
        return '西安';
    }

    if (name.indexOf('西湖') !== -1 || name.indexOf('杭州') !== -1) {
        return '杭州';
    }

    if (name.indexOf('苏州园林') !== -1 || name.indexOf('拙政园') !== -1 || name.indexOf('留园') !== -1 || name.indexOf('苏州') !== -1) {
        return '苏州';
    }

    if (name.indexOf('黄山') !== -1) {
        return '黄山';
    }

    if (name.indexOf('桂林') !== -1 || name.indexOf('漓江') !== -1 || name.indexOf('阳朔') !== -1) {
        return '桂林';
    }

    if (name.indexOf('丽江') !== -1 || name.indexOf('玉龙雪山') !== -1) {
        return '丽江';
    }

    if (name.indexOf('平遥') !== -1) {
        return '平遥';
    }

    if (name.indexOf('鼓浪屿') !== -1 || name.indexOf('厦门') !== -1) {
        return '厦门';
    }

    if (name.indexOf('九寨沟') !== -1) {
        return '九寨沟';
    }

    return '其他城市';
}


// 按城市筛选景点
function filterFeaturesByCity(features, city) {
    if (!city || city === 'all') {
        return features;
    }

    return features.filter(function(feature) {
        return getAttractionCity(feature) === city;
    });
}


// 按城市和偏好筛选景点
function filterFeaturesByCityAndPreference(city, preference) {
    let features = getAllAttractionFeatures();

    // 先按城市过滤，避免半日游、一日游、两日游跨省推荐
    features = filterFeaturesByCity(features, city);

    // 再按偏好过滤
    if (preference === 'history') {
        features = features.filter(function(feature) {
            return ['历史遗址', '古建筑', '文化景区'].includes(getAttractionCategory(feature));
        });
    }

    if (preference === 'nature') {
        features = features.filter(function(feature) {
            return getAttractionCategory(feature) === '自然风光';
        });
    }

    if (preference === 'ancient') {
        features = features.filter(function(feature) {
            return ['古建筑', '园林', '文化景区'].includes(getAttractionCategory(feature));
        });
    }

    // 如果该城市里按偏好查不到，就退回该城市全部景点，但仍然不跨城市
    if (features.length === 0 && city !== 'all') {
        features = filterFeaturesByCity(getAllAttractionFeatures(), city);
    }

    // 如果选择全部城市，才允许从所有景点里补充
    if (features.length === 0) {
        features = getAllAttractionFeatures();
    }

    features.sort(function(a, b) {
        return getAttractionHeat(b) - getAttractionHeat(a);
    });

    return features;
}


// 城市限定版：一键生成游览计划
function generateTravelPlan() {
    const citySelect = document.getElementById('travelPlanCity');
    const city = citySelect ? citySelect.value : 'all';

    const duration = document.getElementById('travelPlanDuration').value;
    const preference = document.getElementById('travelPlanPreference').value;

    const durationConfig = {
        half: {
            title: '半日游计划',
            count: 2,
            intensity: '较低',
            timeAdvice: '半日游时间较短，适合安排同一城市内距离较近、游览压力较小的景点，不建议跨省或跨城市移动。'
        },
        one: {
            title: '一日游计划',
            count: 3,
            intensity: '中等',
            timeAdvice: '一日游适合在同一城市内安排核心景点和补充景点，上午重点游览，下午安排体验型或休闲型景点。'
        },
        two: {
            title: '两日游计划',
            count: 5,
            intensity: '较高',
            timeAdvice: '两日游可以在同一城市或周边区域内进行深度体验，适合加入文创消费、夜间经济和城市漫游内容。'
        }
    };

    const preferenceConfig = getThemeRouteConfig(preference);
    const config = durationConfig[duration];

    let features = filterFeaturesByCityAndPreference(city, preference).slice(0, config.count);

    if (features.length === 0) {
        alert('当前城市没有可用于生成计划的景点数据，请更换城市或选择“全部城市 / 区域”。');
        return;
    }

    drawBusinessRoute(features);

    const totalDistanceKm = calculateRouteDistanceKm(features);
    const cityText = city === 'all' ? '全部城市 / 区域' : city;
    const planTitle = config.title + '：' + cityText + ' · ' + preferenceConfig.preferenceText;

    let html = `
        <p><strong>选择城市：</strong>${escapeHtml(cityText)}</p>
        <p><strong>计划类型：</strong>${config.title}</p>
        <p><strong>偏好方向：</strong>${preferenceConfig.preferenceText}</p>

        <p><strong>推荐逻辑：</strong></p>
        <p>
            系统优先按照用户选择的城市范围筛选景点，再结合景点类别、评分、热度和文创潜力生成游览计划。
            这样可以避免半日游、一日游、两日游出现跨省份、跨区域距离过远的问题，使推荐结果更符合真实旅游出行场景。
        </p>

        <p><strong>推荐理由：</strong></p>
        <p>
            ${preferenceConfig.description}
            本次推荐限定在 <strong>${escapeHtml(cityText)}</strong> 范围内，优先选择该区域内代表性较强、游客关注度较高、主题匹配度较好的景点。
            对于短时间旅游而言，同城游览可以减少交通时间，提高实际游览效率，也更适合游客进行拍照打卡、文化体验和文创消费。
        </p>

        <p><strong>整体建议：</strong>${config.timeAdvice}</p>
        <p><strong>预计路线距离：</strong>约 ${totalDistanceKm.toFixed(1)} 千米</p>
        <p><strong>游览强度：</strong>${config.intensity}</p>
        <hr>
    `;

    if (features.length < config.count) {
        html += `
            <p style="color:#b22126;">
                <strong>提示：</strong>
                当前城市可用景点数量不足 ${config.count} 个，系统已根据现有数据生成简化版游览计划。
                这在课程项目中是正常情况，也可以在报告中说明为“受示例数据量限制”。
            </p>
        `;
    }

    if (duration === 'half') {
        html += `
            <p><strong>半日游安排：</strong></p>
            <ol>
                <li>
                    <strong>第一站：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    推荐作为半日游核心景点。该景点在当前城市中具有较强代表性，适合游客在有限时间内完成重点游览。
                    建议停留 1.5 到 2 小时，用于参观、拍照和了解景点文化背景。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>第二站：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    推荐作为补充体验景点。该景点可以与第一站形成主题衔接，适合安排轻量游览、城市漫步或文创消费。
                    如果游客时间紧张，也可以将该景点作为弹性备选点。
                </li>
            `;
        }

        html += `</ol>`;
    }

    if (duration === 'one') {
        html += `
            <p><strong>一日游安排：</strong></p>
            <ol>
                <li>
                    <strong>上午：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    上午建议安排城市中最具代表性的核心景点。此时游客体力较好，适合进行深度参观、文化讲解和研学体验。
                </li>

                <li>
                    <strong>中午：城市休息与餐饮节点</strong><br>
                    建议结合景点周边餐饮、游客服务中心或文创商店进行休息，提升游客停留时间和综合消费体验。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>下午：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    下午适合安排主题互补型景点，与上午形成文化或景观上的衔接，避免路线内容单一。
                </li>
            `;
        }

        if (features[2]) {
            html += `
                <li>
                    <strong>傍晚：${escapeHtml(getAttractionName(features[2]))}</strong><br>
                    傍晚适合安排轻量游览、拍照打卡或文创购物。该阶段不宜安排过高强度项目，应以体验感和舒适度为主。
                </li>
            `;
        }

        html += `</ol>`;
    }

    if (duration === 'two') {
        html += `
            <p><strong>两日游安排：</strong></p>
            <ol>
                <li>
                    <strong>第一天上午：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    建议作为本次城市游览的核心景点，适合安排重点参观和文化讲解，帮助游客建立对该城市文旅资源的整体印象。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>第一天下午：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    推荐安排与上午景点主题相关或空间距离较近的景点，减少交通转换成本，提高游览效率。
                </li>
            `;
        }

        if (features[2]) {
            html += `
                <li>
                    <strong>第一天晚上：城市夜游与文创消费</strong><br>
                    建议结合城市夜间经济、特色街区、文创商店或地方美食进行体验，提升旅游产品的完整度。
                </li>
            `;
        }

        if (features[3]) {
            html += `
                <li>
                    <strong>第二天上午：${escapeHtml(getAttractionName(features[3]))}</strong><br>
                    第二天上午适合安排另一个具有代表性的景点，形成对城市文化、自然或建筑资源的进一步补充。
                </li>
            `;
        }

        if (features[4]) {
            html += `
                <li>
                    <strong>第二天下午：${escapeHtml(getAttractionName(features[4]))}</strong><br>
                    作为收尾景点，适合安排轻松游览、购物和打卡，帮助游客形成完整的城市旅游记忆。
                </li>
            `;
        }

        html += `</ol>`;
    }

    html += `
        <hr>

        <p><strong>推荐结论：</strong></p>
        <p>
            本游览计划在城市范围内进行景点组合，避免短途旅游出现跨省份、跨区域距离过远的问题。
            与原先直接按照全国景点热度推荐相比，城市限定后的路线更加符合实际出行逻辑，也更适合用于半日游、一日游和两日游产品设计。
        </p>

        <p><strong>业务建议：</strong></p>
        <p>
            对文旅平台而言，可以基于城市维度设计短途游产品，例如“北京一日文化游”“杭州半日休闲游”“苏州园林两日游”等。
            这样既能提升推荐结果的实用性，也能更好地服务游客的真实决策需求。
        </p>

        <p><strong>后续优化方向：</strong></p>
        <p>
            后续还可以继续接入实时交通、酒店位置、门票预约、游客画像和开放时间数据，
            进一步实现更精细化的同城游览路线推荐。
        </p>
    `;

    showBusinessResult(planTitle, html);
}

// ===============================
// 省份 + 城市 + 景点数据扩充版游览计划
// ===============================


// 重点省份与城市配置
const provinceCityMap = {
    '北京': ['北京'],
    '陕西': ['西安'],
    '浙江': ['杭州'],
    '江苏': ['苏州'],
    '安徽': ['黄山'],
    '广西': ['桂林'],
    '云南': ['丽江', '大理'],
    '福建': ['厦门', '武夷山', '龙岩'],
    '四川': ['阿坝', '成都', '乐山'],
    '山西': ['晋中', '大同', '忻州'],
    '河南': ['洛阳', '郑州', '开封'],
    '山东': ['泰安', '济宁', '济南'],
    '湖南': ['张家界', '岳阳', '湘西'],
    '湖北': ['武汉', '十堰', '宜昌'],
    '广东': ['广州', '韶关']
};


// 根据省份更新城市下拉框
function updateTravelPlanCityOptions() {
    const provinceSelect = document.getElementById('travelPlanProvince');
    const citySelect = document.getElementById('travelPlanCity');

    if (!provinceSelect || !citySelect) {
        return;
    }

    const province = provinceSelect.value;
    citySelect.innerHTML = '<option value="all">全部城市 / 区域</option>';

    if (province === 'all') {
        Object.keys(provinceCityMap).forEach(function(provinceName) {
            provinceCityMap[provinceName].forEach(function(cityName) {
                const option = document.createElement('option');
                option.value = cityName;
                option.textContent = provinceName + ' - ' + cityName;
                citySelect.appendChild(option);
            });
        });

        return;
    }

    const cities = provinceCityMap[province] || [];

    cities.forEach(function(cityName) {
        const option = document.createElement('option');
        option.value = cityName;
        option.textContent = cityName;
        citySelect.appendChild(option);
    });
}


// 景点数据扩充
function supplementProvinceCityAttractions() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    const extraAttractions = [
        // 北京
        { name: '故宫博物院', province: '北京', city: '北京', category: '文化景区', coordinate: [116.397, 39.916], description: '中国明清两代皇家宫殿，是北京历史文化旅游的核心代表景点。' },
        { name: '八达岭长城', province: '北京', city: '北京', category: '文化景区', coordinate: [116.024, 40.363], description: '长城的重要代表段落，具有极高历史文化价值和游客吸引力。' },
        { name: '天坛公园', province: '北京', city: '北京', category: '历史遗址', coordinate: [116.407, 39.883], description: '明清皇帝祭天场所，是北京礼制文化的重要空间。' },
        { name: '颐和园', province: '北京', city: '北京', category: '园林', coordinate: [116.275, 39.999], description: '中国古典皇家园林代表，兼具山水景观与历史文化价值。' },

        // 陕西
        { name: '西安城墙', province: '陕西', city: '西安', category: '历史遗址', coordinate: [108.944, 34.262], address: '陕西省西安市碑林区', description: '中国现存规模较大、保存较完整的古代城垣建筑，是西安历史文化的重要代表。' },
        { name: '大雁塔', province: '陕西', city: '西安', category: '古建筑', coordinate: [108.964, 34.219], description: '唐代佛教建筑代表，是西安城市文化地标。' },
        { name: '华清宫', province: '陕西', city: '西安', category: '文化景区', coordinate: [109.216, 34.364], description: '融合历史故事、皇家园林和温泉文化的综合文旅景区。' },

        // 浙江
        { name: '西湖', province: '浙江', city: '杭州', category: '自然风光', coordinate: [120.150, 30.245], description: '杭州代表性自然与人文景观，适合休闲观光和城市文创开发。' },
        { name: '灵隐寺', province: '浙江', city: '杭州', category: '文化景区', coordinate: [120.101, 30.240], description: '杭州重要佛教文化景点，具有较强文化体验价值。' },
        { name: '宋城', province: '浙江', city: '杭州', category: '文化景区', coordinate: [120.096, 30.158], description: '以宋代文化演艺和沉浸体验为特色的文旅景区。' },

        // 江苏
        { name: '苏州园林', province: '江苏', city: '苏州', category: '园林', coordinate: [120.620, 31.320], description: '中国古典园林艺术代表，适合园林美学和文创产品开发。' },
        { name: '拙政园', province: '江苏', city: '苏州', category: '园林', coordinate: [120.627, 31.324], description: '苏州古典园林代表之一，具有精致空间美学价值。' },
        { name: '虎丘', province: '江苏', city: '苏州', category: '文化景区', coordinate: [120.578, 31.338], description: '融合历史传说、古塔景观和城市文化记忆的景区。' },

        // 安徽
        { name: '黄山', province: '安徽', city: '黄山', category: '自然风光', coordinate: [118.167, 30.132], description: '以奇松、怪石、云海、温泉闻名，是自然风光类景点代表。' },
        { name: '宏村', province: '安徽', city: '黄山', category: '古建筑', coordinate: [117.987, 30.004], description: '徽派古村落代表，适合古建筑和乡村文旅展示。' },
        { name: '西递', province: '安徽', city: '黄山', category: '古建筑', coordinate: [117.993, 29.906], description: '保存较完整的徽派古村落，具有传统民居文化价值。' },

        // 广西
        { name: '漓江', province: '广西', city: '桂林', category: '自然风光', coordinate: [110.432, 25.148], description: '以喀斯特山水风光闻名，适合自然观光和摄影旅游。' },
        { name: '阳朔西街', province: '广西', city: '桂林', category: '文化景区', coordinate: [110.496, 24.778], description: '融合山水旅游、街区消费和地方文化体验的热门节点。' },

        // 云南
        { name: '丽江古城', province: '云南', city: '丽江', category: '文化景区', coordinate: [100.234, 26.872], description: '云南代表性古城景区，适合古城文化体验和文创开发。' },
        { name: '玉龙雪山', province: '云南', city: '丽江', category: '自然风光', coordinate: [100.174, 27.104], description: '丽江重要自然景观，具有高山生态和民族文化价值。' },
        { name: '束河古镇', province: '云南', city: '丽江', category: '文化景区', coordinate: [100.207, 26.916], description: '丽江周边古镇景点，适合慢旅行和古镇文化体验。' },
        { name: '大理古城', province: '云南', city: '大理', category: '文化景区', coordinate: [100.166, 25.694], description: '大理历史文化街区代表，适合城市漫游和文创消费。' },
        { name: '崇圣寺三塔', province: '云南', city: '大理', category: '古建筑', coordinate: [100.151, 25.706], description: '大理代表性古建筑景观，体现地方历史文化特色。' },

        // 福建
        { name: '鼓浪屿', province: '福建', city: '厦门', category: '自然风光', coordinate: [118.066, 24.447], description: '厦门代表性岛屿景区，兼具自然风光和历史建筑价值。' },
        { name: '武夷山', province: '福建', city: '武夷山', category: '自然风光', coordinate: [118.035, 27.756], description: '福建自然与文化双重价值景区，适合生态旅游和茶文化展示。' },
        { name: '福建土楼', province: '福建', city: '龙岩', category: '古建筑', coordinate: [117.000, 24.659], description: '客家传统建筑代表，具有独特建筑形态和文化价值。' },

        // 四川
        { name: '九寨沟', province: '四川', city: '阿坝', category: '自然风光', coordinate: [103.918, 33.166], description: '四川代表性自然风光景区，以彩池、瀑布和森林景观闻名。' },
        { name: '黄龙风景区', province: '四川', city: '阿坝', category: '自然风光', coordinate: [103.834, 32.744], description: '以钙华彩池和高原生态景观闻名，适合自然风光旅游。' },
        { name: '都江堰', province: '四川', city: '成都', category: '历史遗址', coordinate: [103.608, 31.005], description: '古代水利工程代表，兼具历史文化和工程遗产价值。' },
        { name: '峨眉山', province: '四川', city: '乐山', category: '自然风光', coordinate: [103.337, 29.524], description: '山岳景观与佛教文化结合的综合型景区。' },

        // 山西
        { name: '平遥古城', province: '山西', city: '晋中', category: '文化景区', coordinate: [112.174, 37.201], description: '保存完整的古城景区，体现晋商文化和古城格局。' },
        { name: '云冈石窟', province: '山西', city: '大同', category: '历史遗址', coordinate: [113.139, 40.110], description: '中国石窟艺术代表，具有重要历史和艺术价值。' },
        { name: '五台山', province: '山西', city: '忻州', category: '文化景区', coordinate: [113.592, 39.008], description: '佛教文化名山，适合宗教文化和山岳旅游展示。' },

        // 河南
        { name: '龙门石窟', province: '河南', city: '洛阳', category: '历史遗址', coordinate: [112.470, 34.559], description: '石窟艺术代表景区，具有极高文化遗产价值。' },
        { name: '少林寺', province: '河南', city: '郑州', category: '文化景区', coordinate: [112.935, 34.507], description: '武术文化和佛教文化结合的著名景点。' },
        { name: '清明上河园', province: '河南', city: '开封', category: '文化景区', coordinate: [114.314, 34.803], description: '以宋代市井文化和沉浸式演艺为特色的文旅景区。' },

        // 山东
        { name: '泰山', province: '山东', city: '泰安', category: '自然风光', coordinate: [117.098, 36.255], description: '五岳之首，兼具自然山岳景观和历史文化价值。' },
        { name: '曲阜三孔', province: '山东', city: '济宁', category: '历史遗址', coordinate: [116.987, 35.595], description: '孔庙、孔府、孔林组成的儒家文化核心景区。' },
        { name: '趵突泉', province: '山东', city: '济南', category: '自然风光', coordinate: [117.015, 36.661], description: '济南泉水文化代表景点，适合城市自然文化展示。' },

        // 湖南
        { name: '张家界国家森林公园', province: '湖南', city: '张家界', category: '自然风光', coordinate: [110.479, 29.327], description: '以峰林地貌闻名，是湖南自然风光旅游代表。' },
        { name: '岳阳楼', province: '湖南', city: '岳阳', category: '古建筑', coordinate: [113.113, 29.361], description: '江南名楼之一，具有文学、历史和建筑文化价值。' },
        { name: '凤凰古城', province: '湖南', city: '湘西', category: '文化景区', coordinate: [109.598, 27.948], description: '湘西代表性古城景区，适合古城文化与民族风情展示。' },

        // 湖北
        { name: '黄鹤楼', province: '湖北', city: '武汉', category: '古建筑', coordinate: [114.306, 30.544], description: '武汉代表性城市文化地标，具有诗词文化和建筑价值。' },
        { name: '武当山', province: '湖北', city: '十堰', category: '文化景区', coordinate: [111.010, 32.397], description: '道教文化名山，兼具古建筑群和自然山岳景观。' },
        { name: '三峡大坝', province: '湖北', city: '宜昌', category: '文化景区', coordinate: [111.003, 30.826], description: '大型水利工程景观，适合工程旅游和科普展示。' },

        // 广东
        { name: '广州塔', province: '广东', city: '广州', category: '文化景区', coordinate: [113.330, 23.106], description: '广州现代城市地标，适合城市观光和夜游经济展示。' },
        { name: '陈家祠', province: '广东', city: '广州', category: '古建筑', coordinate: [113.257, 23.129], description: '岭南传统建筑和民间工艺代表景点。' },
        { name: '丹霞山', province: '广东', city: '韶关', category: '自然风光', coordinate: [113.749, 25.029], description: '丹霞地貌代表景区，适合自然景观和地学旅游展示。' }
    ];

    const existingNames = new Set();

    attractionsSource.getFeatures().forEach(function(feature) {
        existingNames.add(getAttractionName(feature));
    });

    extraAttractions.forEach(function(item) {
        if (existingNames.has(item.name)) {
            // 如果原来已经有该景点，就只补充省份、城市和类别
            attractionsSource.getFeatures().forEach(function(feature) {
                if (getAttractionName(feature) === item.name) {
                    feature.set('province', item.province);
feature.set('city', item.city);
feature.set('category', item.category);
feature.set('description', feature.get('description') || item.description);

if (!feature.get('address')) {
    feature.set(
        'address',
        buildAddressFromParts(item.name, item.province, item.city, item.county || item.district || '')
    );
}
                }
            });

            return;
        }

        const feature = new ol.Feature({
            geometry: new ol.geom.Point(item.coordinate)
        });

        const rating = Number((4.5 + Math.random() * 0.5).toFixed(1));

        feature.setProperties({
    name: item.name,
    province: item.province,
    city: item.city,
    category: item.category,
    description: item.description,
    address: item.address || buildAddressFromParts(item.name, item.province, item.city, item.county || item.district || ''),
    rating: rating,
    score: rating,
    randomRating: rating,
    randomRatingAssigned: true
});

        attractionsSource.addFeature(feature);
    });
}

// 获取景点省份
function getAttractionProvince(feature) {
    const province = feature.get('province') || feature.get('省份') || '';
    const name = getAttractionName(feature);

    if (province) {
        return province;
    }

    if (['故宫', '长城', '八达岭', '天坛', '颐和园'].some(key => name.indexOf(key) !== -1)) return '北京';
    if (['兵马俑', '大雁塔', '华清宫','西安城墙', '华山'].some(key => name.indexOf(key) !== -1)) return '陕西';
    if (['布达拉宫'].some(key => name.indexOf(key) !== -1)) return '西藏';
    if (['承德避暑山庄'].some(key => name.indexOf(key) !== -1)) return '河北';
    if (['西湖', '灵隐寺', '宋城'].some(key => name.indexOf(key) !== -1)) return '浙江';
    if (['苏州园林', '拙政园', '虎丘'].some(key => name.indexOf(key) !== -1)) return '江苏';
    if (['黄山', '宏村', '西递'].some(key => name.indexOf(key) !== -1)) return '安徽';
    if (['桂林', '漓江', '阳朔'].some(key => name.indexOf(key) !== -1)) return '广西';
    if (['丽江', '玉龙雪山', '大理', '束河', '崇圣寺三塔'].some(key => name.indexOf(key) !== -1)) return '云南';
    if (['鼓浪屿', '厦门', '武夷山', '土楼'].some(key => name.indexOf(key) !== -1)) return '福建';
    if (['九寨沟', '黄龙', '都江堰', '峨眉山'].some(key => name.indexOf(key) !== -1)) return '四川';
    if (['平遥', '云冈', '五台山'].some(key => name.indexOf(key) !== -1)) return '山西';
    if (['龙门石窟', '少林寺', '清明上河园'].some(key => name.indexOf(key) !== -1)) return '河南';
    if (['泰山', '曲阜', '三孔', '趵突泉'].some(key => name.indexOf(key) !== -1)) return '山东';
    if (['张家界', '岳阳楼', '凤凰古城'].some(key => name.indexOf(key) !== -1)) return '湖南';
    if (['黄鹤楼', '武当山', '三峡大坝'].some(key => name.indexOf(key) !== -1)) return '湖北';
    if (['广州塔', '陈家祠', '丹霞山'].some(key => name.indexOf(key) !== -1)) return '广东';

    return '其他省份';
}

// 获取景点城市
function getAttractionCity(feature) {
    const city = feature.get('city') || feature.get('城市') || feature.get('area') || feature.get('地区') || '';
    const name = getAttractionName(feature);

    if (city) {
        return city;
    }

    if (['故宫', '长城', '八达岭', '天坛', '颐和园'].some(key => name.indexOf(key) !== -1)) return '北京';
    if (['兵马俑', '大雁塔', '华清宫', '西安城墙'].some(key => name.indexOf(key) !== -1)) return '西安';
    if (['华山'].some(key => name.indexOf(key) !== -1)) return '渭南';
    if (['布达拉宫'].some(key => name.indexOf(key) !== -1)) return '拉萨';
    if (['承德避暑山庄'].some(key => name.indexOf(key) !== -1)) return '承德';
    if (['西湖', '灵隐寺', '宋城'].some(key => name.indexOf(key) !== -1)) return '杭州';
    if (['苏州园林', '拙政园', '虎丘'].some(key => name.indexOf(key) !== -1)) return '苏州';
    if (['黄山', '宏村', '西递'].some(key => name.indexOf(key) !== -1)) return '黄山';
    if (['桂林', '漓江', '阳朔'].some(key => name.indexOf(key) !== -1)) return '桂林';
    if (['丽江', '玉龙雪山', '束河'].some(key => name.indexOf(key) !== -1)) return '丽江';
    if (['大理', '崇圣寺三塔'].some(key => name.indexOf(key) !== -1)) return '大理';
    if (['鼓浪屿', '厦门'].some(key => name.indexOf(key) !== -1)) return '厦门';
    if (['武夷山'].some(key => name.indexOf(key) !== -1)) return '武夷山';
    if (['土楼'].some(key => name.indexOf(key) !== -1)) return '龙岩';
    if (['九寨沟', '黄龙'].some(key => name.indexOf(key) !== -1)) return '阿坝';
    if (['都江堰'].some(key => name.indexOf(key) !== -1)) return '成都';
    if (['峨眉山'].some(key => name.indexOf(key) !== -1)) return '乐山';
    if (['平遥'].some(key => name.indexOf(key) !== -1)) return '晋中';
    if (['云冈'].some(key => name.indexOf(key) !== -1)) return '大同';
    if (['五台山'].some(key => name.indexOf(key) !== -1)) return '忻州';
    if (['龙门石窟'].some(key => name.indexOf(key) !== -1)) return '洛阳';
    if (['少林寺'].some(key => name.indexOf(key) !== -1)) return '郑州';
    if (['清明上河园'].some(key => name.indexOf(key) !== -1)) return '开封';
    if (['泰山'].some(key => name.indexOf(key) !== -1)) return '泰安';
    if (['曲阜', '三孔'].some(key => name.indexOf(key) !== -1)) return '济宁';
    if (['趵突泉'].some(key => name.indexOf(key) !== -1)) return '济南';
    if (['张家界'].some(key => name.indexOf(key) !== -1)) return '张家界';
    if (['岳阳楼'].some(key => name.indexOf(key) !== -1)) return '岳阳';
    if (['凤凰古城'].some(key => name.indexOf(key) !== -1)) return '湘西';
    if (['黄鹤楼'].some(key => name.indexOf(key) !== -1)) return '武汉';
    if (['武当山'].some(key => name.indexOf(key) !== -1)) return '十堰';
    if (['三峡大坝'].some(key => name.indexOf(key) !== -1)) return '宜昌';
    if (['广州塔', '陈家祠'].some(key => name.indexOf(key) !== -1)) return '广州';
    if (['丹霞山'].some(key => name.indexOf(key) !== -1)) return '韶关';

    return '其他城市';
}

// 获取景点显示地址：优先使用原始 address；没有 address 时，用省、市、区县自动拼接
function getAttractionDisplayAddress(feature) {
    if (!feature) {
        return '暂无地址';
    }

    const rawAddress = (
        feature.get('address') ||
        feature.get('地址') ||
        feature.get('addr') ||
        ''
    ).toString().trim();

    if (rawAddress && rawAddress !== '暂无地址') {
        return rawAddress;
    }

    const name = getAttractionName(feature) || feature.get('name') || '';

    const province =
        feature.get('province') ||
        feature.get('省份') ||
        getAttractionProvince(feature) ||
        '';

    const city =
        feature.get('city') ||
        feature.get('城市') ||
        feature.get('area') ||
        feature.get('地区') ||
        getAttractionCity(feature) ||
        '';

    const county =
        feature.get('county') ||
        feature.get('district') ||
        feature.get('区县') ||
        feature.get('县区') ||
        '';

    return buildAddressFromParts(name, province, city, county);
}

// 根据景点名称、省、市、区县拼接地址
function buildAddressFromParts(name, province, city, county) {
    const specialAddressMap = {
        '清明上河园': '河南省开封市龙亭区',
        '曲阜三孔': '山东省济宁市曲阜市',
        '少林寺': '河南省郑州市登封市',
        '龙门石窟': '河南省洛阳市洛龙区',
        '泰山': '山东省泰安市泰山区',
        '趵突泉': '山东省济南市历下区',
        '平遥古城': '山西省晋中市平遥县',
        '云冈石窟': '山西省大同市云冈区',
        '五台山': '山西省忻州市五台县',
        '岳阳楼': '湖南省岳阳市岳阳楼区',
        '凤凰古城': '湖南省湘西土家族苗族自治州凤凰县',
        '黄鹤楼': '湖北省武汉市武昌区',
        '武当山': '湖北省十堰市丹江口市',
        '三峡大坝': '湖北省宜昌市夷陵区',
        '广州塔': '广东省广州市海珠区',
        '陈家祠': '广东省广州市荔湾区',
        '丹霞山': '广东省韶关市仁化县'
    };

    const safeName = (name || '').toString().trim();

    if (safeName) {
        for (const key in specialAddressMap) {
            if (safeName.indexOf(key) !== -1 || key.indexOf(safeName) !== -1) {
                return specialAddressMap[key];
            }
        }
    }

    const provinceText = formatProvinceForAddress(province);
    const cityText = formatCityForAddress(city, provinceText);
    const countyText = formatCountyForAddress(county);

    const address = [provinceText, cityText, countyText]
        .filter(Boolean)
        .join('');

    return address || '暂无地址';
}

// 省份名称补全
function formatProvinceForAddress(province) {
    let text = (province || '').toString().trim();

    if (!text || text.indexOf('其他') !== -1 || text.indexOf('未知') !== -1) {
        return '';
    }

    if (
        text.endsWith('省') ||
        text.endsWith('市') ||
        text.endsWith('自治区') ||
        text.endsWith('特别行政区')
    ) {
        return text;
    }

    const municipalityList = ['北京', '上海', '天津', '重庆'];

    if (municipalityList.includes(text)) {
        return text + '市';
    }

    const autonomousRegionMap = {
        '广西': '广西壮族自治区',
        '内蒙古': '内蒙古自治区',
        '宁夏': '宁夏回族自治区',
        '新疆': '新疆维吾尔自治区',
        '西藏': '西藏自治区'
    };

    if (autonomousRegionMap[text]) {
        return autonomousRegionMap[text];
    }

    return text + '省';
}

// 城市名称补全
function formatCityForAddress(city, provinceText) {
    let text = (city || '').toString().trim();

    if (!text || text.indexOf('其他') !== -1 || text.indexOf('未知') !== -1) {
        return '';
    }

    // 直辖市不要重复显示成“北京市北京市”
    const municipalityMap = {
        '北京市': '北京',
        '上海市': '上海',
        '天津市': '天津',
        '重庆市': '重庆'
    };

    if (municipalityMap[provinceText] && municipalityMap[provinceText] === text) {
        return '';
    }

    const specialCityMap = {
        '阿坝': '阿坝藏族羌族自治州',
        '湘西': '湘西土家族苗族自治州',
        '大理': '大理白族自治州'
    };

    if (specialCityMap[text]) {
        return specialCityMap[text];
    }

    if (
        text.endsWith('市') ||
        text.endsWith('州') ||
        text.endsWith('地区') ||
        text.endsWith('盟') ||
        text.endsWith('自治州')
    ) {
        return text;
    }

    return text + '市';
}

// 区县名称补全
function formatCountyForAddress(county) {
    let text = (county || '').toString().trim();

    if (!text || text.indexOf('其他') !== -1 || text.indexOf('未知') !== -1) {
        return '';
    }

    if (
        text.endsWith('区') ||
        text.endsWith('县') ||
        text.endsWith('市') ||
        text.endsWith('旗') ||
        text.endsWith('自治县')
    ) {
        return text;
    }

    return text + '县';
}

// 按省份、城市、偏好筛选景点
function filterFeaturesByProvinceCityAndPreference(province, city, preference) {
    let features = getAllAttractionFeatures();

    if (province && province !== 'all') {
        features = features.filter(function(feature) {
            return getAttractionProvince(feature) === province;
        });
    }

    if (city && city !== 'all') {
        features = features.filter(function(feature) {
            return getAttractionCity(feature) === city;
        });
    }

    if (preference === 'history') {
        features = features.filter(function(feature) {
            return ['历史遗址', '古建筑', '文化景区'].includes(getAttractionCategory(feature));
        });
    }

    if (preference === 'nature') {
        features = features.filter(function(feature) {
            return getAttractionCategory(feature) === '自然风光';
        });
    }

    if (preference === 'ancient') {
        features = features.filter(function(feature) {
            return ['古建筑', '园林', '文化景区'].includes(getAttractionCategory(feature));
        });
    }

    // 如果城市 + 偏好没有结果，退回到该城市全部景点
    if (features.length === 0 && city && city !== 'all') {
        features = getAllAttractionFeatures().filter(function(feature) {
            return getAttractionCity(feature) === city;
        });
    }

    // 如果省份 + 偏好没有结果，退回到该省份全部景点
    if (features.length === 0 && province && province !== 'all') {
        features = getAllAttractionFeatures().filter(function(feature) {
            return getAttractionProvince(feature) === province;
        });
    }

    features.sort(function(a, b) {
        return getAttractionHeat(b) - getAttractionHeat(a);
    });

    return features;
}


// 覆盖旧版一键生成游览计划：省份 + 城市限定版
function generateTravelPlan() {
    const provinceSelect = document.getElementById('travelPlanProvince');
    const citySelect = document.getElementById('travelPlanCity');

    const province = provinceSelect ? provinceSelect.value : 'all';
    const city = citySelect ? citySelect.value : 'all';

    const duration = document.getElementById('travelPlanDuration').value;
    const preference = document.getElementById('travelPlanPreference').value;

    const durationConfig = {
        half: {
            title: '半日游计划',
            count: 2,
            intensity: '较低',
            timeAdvice: '半日游时间较短，原则上应限定在同一城市内，重点选择交通较便利、游览耗时较短的景点。'
        },
        one: {
            title: '一日游计划',
            count: 3,
            intensity: '中等',
            timeAdvice: '一日游适合在同一城市或近距离区域内安排核心景点与补充景点，不宜跨省移动。'
        },
        two: {
            title: '两日游计划',
            count: 5,
            intensity: '较高',
            timeAdvice: '两日游可以在同一城市或同一省份内进行深度体验，适合加入夜游、文创消费和城市漫游内容。'
        }
    };

    const preferenceConfig = getThemeRouteConfig(preference);
    const config = durationConfig[duration];

    let features = filterFeaturesByProvinceCityAndPreference(province, city, preference).slice(0, config.count);

    if (features.length === 0) {
        alert('当前省份或城市没有可用于生成计划的景点数据，请更换筛选条件。');
        return;
    }

    drawBusinessRoute(features);

    const totalDistanceKm = calculateRouteDistanceKm(features);

    const provinceText = province === 'all' ? '全部省份 / 区域' : province;
    const cityText = city === 'all' ? '全部城市 / 区域' : city;

    const planTitle = config.title + '：' + provinceText + ' · ' + cityText + ' · ' + preferenceConfig.preferenceText;

    let html = `
        <p><strong>选择省份：</strong>${escapeHtml(provinceText)}</p>
        <p><strong>选择城市：</strong>${escapeHtml(cityText)}</p>
        <p><strong>计划类型：</strong>${config.title}</p>
        <p><strong>偏好方向：</strong>${preferenceConfig.preferenceText}</p>

        <p><strong>推荐逻辑：</strong></p>
        <p>
            系统先按省份和城市范围筛选景点，再结合景点类别、评分、热度和文创潜力进行排序推荐。
            这样可以避免短途游览计划出现跨省、跨区域距离过远的问题，使半日游、一日游和两日游更符合真实旅游出行规律。
        </p>

        <p><strong>推荐理由：</strong></p>
        <p>
            ${preferenceConfig.description}
            本次推荐优先限定在 <strong>${escapeHtml(provinceText)}</strong> 的 <strong>${escapeHtml(cityText)}</strong> 范围内。
            对于短时间旅游而言，同城或近距离区域游览可以减少交通成本，提高实际游览时间，也更适合游客进行拍照打卡、文化体验和文创消费。
        </p>

        <p><strong>整体建议：</strong>${config.timeAdvice}</p>
        <p><strong>预计路线距离：</strong>约 ${totalDistanceKm.toFixed(1)} 千米</p>
        <p><strong>游览强度：</strong>${config.intensity}</p>
        <hr>
    `;

    if (features.length < config.count) {
        html += `
            <p style="color:#b22126;">
                <strong>提示：</strong>
                当前筛选范围内可用景点数量不足 ${config.count} 个，系统已根据现有数据生成简化版游览计划。
            </p>
        `;
    }

    if (duration === 'half') {
        html += `
            <p><strong>半日游安排：</strong></p>
            <ol>
                <li>
                    <strong>第一站：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    推荐作为半日游核心景点。该景点在当前区域中具有较强代表性，适合游客在有限时间内完成重点游览。
                    建议停留 1.5 到 2 小时，用于参观、拍照和了解景点文化背景。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>第二站：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    推荐作为补充体验景点。该景点可以与第一站形成主题衔接，适合安排轻量游览、城市漫步或文创消费。
                </li>
            `;
        }

        html += `</ol>`;
    }

    if (duration === 'one') {
        html += `
            <p><strong>一日游安排：</strong></p>
            <ol>
                <li>
                    <strong>上午：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    上午建议安排区域内最具代表性的核心景点。此时游客体力较好，适合进行深度参观、文化讲解和研学体验。
                </li>
                <li>
                    <strong>中午：休息、餐饮与文创消费节点</strong><br>
                    建议结合景点周边餐饮、游客服务中心或文创商店进行休息，提升游客停留时间和综合消费体验。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>下午：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    下午适合安排主题互补型景点，与上午形成文化或景观上的衔接，避免路线内容单一。
                </li>
            `;
        }

        if (features[2]) {
            html += `
                <li>
                    <strong>傍晚：${escapeHtml(getAttractionName(features[2]))}</strong><br>
                    傍晚适合安排轻量游览、拍照打卡或文创购物。该阶段不宜安排过高强度项目，应以体验感和舒适度为主。
                </li>
            `;
        }

        html += `</ol>`;
    }

    if (duration === 'two') {
        html += `
            <p><strong>两日游安排：</strong></p>
            <ol>
                <li>
                    <strong>第一天上午：${escapeHtml(getAttractionName(features[0]))}</strong><br>
                    建议作为本次游览的核心景点，适合安排重点参观和文化讲解，帮助游客建立对该区域文旅资源的整体印象。
                </li>
        `;

        if (features[1]) {
            html += `
                <li>
                    <strong>第一天下午：${escapeHtml(getAttractionName(features[1]))}</strong><br>
                    推荐安排与上午景点主题相关或空间距离较近的景点，减少交通转换成本，提高游览效率。
                </li>
            `;
        }

        if (features[2]) {
            html += `
                <li>
                    <strong>第一天晚上：城市夜游与文创消费</strong><br>
                    建议结合城市夜间经济、特色街区、文创商店或地方美食进行体验，提升旅游产品完整度。
                </li>
            `;
        }

        if (features[3]) {
            html += `
                <li>
                    <strong>第二天上午：${escapeHtml(getAttractionName(features[3]))}</strong><br>
                    第二天上午适合安排另一个具有代表性的景点，形成对区域文化、自然或建筑资源的进一步补充。
                </li>
            `;
        }

        if (features[4]) {
            html += `
                <li>
                    <strong>第二天下午：${escapeHtml(getAttractionName(features[4]))}</strong><br>
                    作为收尾景点，适合安排轻松游览、购物和打卡，帮助游客形成完整的城市旅游记忆。
                </li>
            `;
        }

        html += `</ol>`;
    }

    html += `
        <hr>
        <p><strong>推荐结论：</strong></p>
        <p>
            本游览计划通过省份和城市双重限制，避免短途旅游出现跨省份、跨区域距离过远的问题。
            与全国范围内直接推荐高热度景点相比，该方式更加符合真实旅游出行场景，也更适合半日游、一日游和两日游产品设计。
        </p>

        <p><strong>业务建议：</strong></p>
        <p>
            文旅平台可以基于省份和城市维度设计短途游产品，例如“北京一日文化游”“杭州半日休闲游”“苏州园林两日游”等。
            这种方式既能提升推荐结果的实用性，也能更好地服务游客真实决策需求。
        </p>
    `;

    showBusinessResult(planTitle, html);
}


// 页面加载后初始化城市下拉框，并补充景点数据
setTimeout(function() {
    supplementProvinceCityAttractions();
    updateTravelPlanCityOptions();

    if (typeof normalizeAttractionCategories === 'function') {
        normalizeAttractionCategories();
    }

    if (typeof assignRandomRatingsToAttractions === 'function') {
        assignRandomRatingsToAttractions();
    }
    refreshAttractionQueryDropdown();
}, 1000);

setTimeout(function() {
    supplementProvinceCityAttractions();

    if (typeof assignRandomRatingsToAttractions === 'function') {
        assignRandomRatingsToAttractions();
    }
    refreshAttractionQueryDropdown();
}, 2500);

// ===============================
// 重新生成“景点查询”的选择景点下拉列表
// 解决后续新增景点没有出现在下拉列表中的问题
// ===============================

window.attractionQueryFeatureList = [];

// 获取景点显示名称
function getAttractionQueryName(feature) {
    return (
        feature.get('name') ||
        feature.get('title') ||
        feature.get('名称') ||
        '未命名景点'
    );
}

// 刷新景点查询下拉列表
function refreshAttractionQueryDropdown() {
    const menu = document.getElementById('attractionQueryMenu');
    const button = document.getElementById('attractionQueryButton');

    if (!menu) {
        console.warn('没有找到 attractionQueryMenu，请检查 index.html 中景点查询下拉列表是否添加了 id。');
        return;
    }

    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    const features = attractionsSource.getFeatures().filter(function(feature) {
        return feature.getGeometry();
    });

    // 按省份、城市、名称简单排序，显示更整齐
    features.sort(function(a, b) {
        const provinceA = a.get('province') || '';
        const provinceB = b.get('province') || '';
        const cityA = a.get('city') || '';
        const cityB = b.get('city') || '';
        const nameA = getAttractionQueryName(a);
        const nameB = getAttractionQueryName(b);

        return (provinceA + cityA + nameA).localeCompare(provinceB + cityB + nameB, 'zh-CN');
    });

    window.attractionQueryFeatureList = features;

    menu.innerHTML = '';

    if (features.length === 0) {
        menu.innerHTML = '<li><span class="dropdown-item text-muted">暂无景点数据</span></li>';
        return;
    }

    features.forEach(function(feature, index) {
        const name = getAttractionQueryName(feature);
        const province = getAttractionProvince(feature);
const city = getAttractionCity(feature);
const category = feature.get('category') || '文化景区';

// 顺便把推断出来的省份和城市写回景点属性，后面其他功能也能用
feature.set('province', province);
feature.set('city', city);
        const li = document.createElement('li');
        const a = document.createElement('a');

        a.className = 'dropdown-item';
        a.href = '#';

        // 下拉列表显示：省份-城市-景点名
        a.textContent = province + ' ' + city + ' · ' + name;

        a.onclick = function(event) {
            event.preventDefault();

            if (button) {
                button.textContent = name;
            }

            selectAttractionFromQueryDropdown(index);
        };

        li.appendChild(a);
        menu.appendChild(li);
    });
}

// 点击景点查询下拉列表中的景点后：
// 1. 自动追踪放大到该景点
// 2. 触发地图上原来的景点点击逻辑
// 3. 弹出和“单击地图景点”完全一样的属性信息框
function selectAttractionFromQueryDropdown(index) {
    const feature = window.attractionQueryFeatureList[index];

    if (!feature || !feature.getGeometry()) {
        alert('没有找到该景点。');
        return;
    }

    const coord = feature.getGeometry().getCoordinates();
    const name = getAttractionQueryName(feature);

    const button = document.getElementById('attractionQueryButton');

    if (button) {
        button.textContent = name;
    }

    // 关闭可能影响点击识别的图层
    if (typeof clusterLayer !== 'undefined' && clusterLayer) {
        clusterLayer.setVisible(false);
    }

    if (typeof heatmapLayer !== 'undefined' && heatmapLayer) {
        heatmapLayer.setVisible(false);
    }

    // 确保普通景点图层可见
    if (typeof attractionsLayer !== 'undefined' && attractionsLayer) {
        attractionsLayer.setVisible(true);
        attractionsLayer.setZIndex(1000);
    }

    // 清除空间查询监听，避免和这次点击冲突
    if (typeof clearBoxSelectListeners === 'function') {
        clearBoxSelectListeners();
    }

    if (typeof clearCircleSelectListeners === 'function') {
        clearCircleSelectListeners();
    }

    if (typeof clearPolygonSelectListeners === 'function') {
        clearPolygonSelectListeners();
    }

    if (typeof clearTwoClickQueryListeners === 'function') {
        clearTwoClickQueryListeners();
    }

    // 自动追踪并放大到所选景点
    map.getView().animate(
        {
            center: coord,
            zoom: 13,
            duration: 200
        },
        function() {
            setTimeout(function() {
                map.renderSync();

                const pixel = map.getPixelFromCoordinate(coord);

                // 关键：模拟地图 singleclick
                // 这样会走原来 map.on('singleclick') 里的景点弹窗逻辑
                map.dispatchEvent({
                    type: 'click',
                    coordinate: coord,
                    pixel: pixel,
                    dragging: false
                });
            }, 20);
        }
    );
}

setTimeout(function() {
    refreshAttractionQueryDropdown();
}, 4000);

// ===== 刷新模拟轨迹、路线规划相关景点下拉框 =====

// 生成统一景点列表
function getUnifiedAttractionListForSelect() {
    if (typeof normalizeAttractionCategories === 'function') {
        normalizeAttractionCategories();
    }

    if (typeof assignRandomRatingsToAttractions === 'function') {
        assignRandomRatingsToAttractions();
    }

    const features = attractionsSource.getFeatures().filter(function(feature) {
        return feature.getGeometry();
    });

    // 去重，防止重复景点进入下拉框
    const nameMap = new Map();

    features.forEach(function(feature) {
        const name = getAttractionName(feature);

        if (!nameMap.has(name)) {
            const province = getAttractionProvince(feature);
            const city = getAttractionCity(feature);

            feature.set('province', province);
            feature.set('city', city);

            nameMap.set(name, feature);
        }
    });

    const uniqueFeatures = Array.from(nameMap.values());

    uniqueFeatures.sort(function(a, b) {
        const textA = getAttractionProvince(a) + getAttractionCity(a) + getAttractionName(a);
        const textB = getAttractionProvince(b) + getAttractionCity(b) + getAttractionName(b);

        return textA.localeCompare(textB, 'zh-CN');
    });

    return uniqueFeatures;
}


// 判断这个 select 是否应该被刷新为景点下拉框
function isAttractionRelatedSelect(select) {
    const id = (select.id || '').toLowerCase();
    const name = (select.name || '').toLowerCase();
    const className = (select.className || '').toLowerCase();
    const parentText = (select.parentElement ? select.parentElement.innerText : '').toLowerCase();

    // 这些不是景点列表，必须排除
    const excludedIds = [
        'attrsearchcategory',
        'recommendpreference',
        'recommendmode',
        'travelplanprovince',
        'travelplancity',
        'travelplanduration',
        'travelplanpreference',
        'routecosttype',
        'basemapselect',
        'layerselect'
    ];

    if (excludedIds.includes(id)) {
        return false;
    }

    const text = id + ' ' + name + ' ' + className + ' ' + parentText;

    // 命中这些关键词，认为它是路线规划 / 模拟轨迹相关的景点选择框
    return (
        text.includes('route') ||
        text.includes('track') ||
        text.includes('start') ||
        text.includes('end') ||
        text.includes('point') ||
        text.includes('attraction') ||
        text.includes('scenic') ||
        text.includes('路线') ||
        text.includes('轨迹') ||
        text.includes('起点') ||
        text.includes('终点') ||
        text.includes('景点')
    );
}


// 填充单个 select
function fillAttractionSelect(select) {
    const oldValue = select.value;
    const oldText = select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : '';

    const features = getUnifiedAttractionListForSelect();

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '请选择景点';
    select.appendChild(placeholder);

    features.forEach(function(feature) {
        const name = getAttractionName(feature);
        const province = getAttractionProvince(feature);
        const city = getAttractionCity(feature);

        const option = document.createElement('option');

        // 用景点名称作为 value，兼容原来的路线规划和轨迹函数
        option.value = name;
        option.textContent = province + ' ' + city + ' · ' + name;

        option.dataset.name = name;
        option.dataset.province = province;
        option.dataset.city = city;

        const coord = feature.getGeometry().getCoordinates();
        option.dataset.lon = coord[0];
        option.dataset.lat = coord[1];

        select.appendChild(option);
    });

    // 尽量保留原来的选中项
    if (oldValue) {
        select.value = oldValue;
    }

    if (!select.value && oldText) {
        Array.from(select.options).some(function(option) {
            if (option.textContent.indexOf(oldText) !== -1 || oldText.indexOf(option.value) !== -1) {
                select.value = option.value;
                return true;
            }

            return false;
        });
    }
}


// 刷新所有路线规划 / 模拟轨迹相关 select
function refreshRouteAndTrackAttractionSelects() {
    const selects = document.querySelectorAll('select');

    selects.forEach(function(select) {
        if (isAttractionRelatedSelect(select)) {
            fillAttractionSelect(select);
        }
    });

    // 同时刷新右侧“景点查询”的下拉列表
    if (typeof refreshAttractionQueryDropdown === 'function') {
        refreshAttractionQueryDropdown();
    }
}

// 页面加载和景点补充后，多次刷新，防止数据加载先后顺序导致下拉框不完整
setTimeout(function() {
    fixCustomAttractionData();
    refreshRouteAndTrackAttractionSelects();
}, 1000);

setTimeout(function() {
    fixCustomAttractionData();
    refreshRouteAndTrackAttractionSelects();
}, 2500);

setTimeout(function() {
    fixCustomAttractionData();
    refreshRouteAndTrackAttractionSelects();
}, 4500);

// ===============================
// 强制刷新：模拟轨迹 / 路线规划 景点下拉列表
// 使用 attractionsSource 最新景点数据，不再读取旧的 data/attractions.geojson
// ===============================


// 获取最新景点列表：供模拟轨迹和路线规划下拉框使用
// 不删除、不过滤任何正常景点，直接读取 attractionsSource 里的最新数据
function getNewestAttractionFeaturesForRouteTrack() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return [];
    }

    // 先确保后续新增的省份城市景点已经加入到 attractionsSource
    if (typeof supplementProvinceCityAttractions === 'function') {
        supplementProvinceCityAttractions();
    }

    if (typeof normalizeAttractionCategories === 'function') {
        normalizeAttractionCategories();
    }

    if (typeof assignRandomRatingsToAttractions === 'function') {
        assignRandomRatingsToAttractions();
    }

    const nameMap = new Map();

    attractionsSource.getFeatures().forEach(function(feature) {
        if (!feature.getGeometry()) {
            return;
        }

        const name = getAttractionName(feature);
        const province = getAttractionProvince(feature);
        const city = getAttractionCity(feature);

        feature.set('province', province);
        feature.set('city', city);

        // 只按景点名称去重，不做关键词删除
        if (!nameMap.has(name)) {
            nameMap.set(name, feature);
        }
    });

    const features = Array.from(nameMap.values());

    features.sort(function(a, b) {
        const textA = getAttractionProvince(a) + getAttractionCity(a) + getAttractionName(a);
        const textB = getAttractionProvince(b) + getAttractionCity(b) + getAttractionName(b);

        return textA.localeCompare(textB, 'zh-CN');
    });

    return features;
}


// 创建 option
// value 使用坐标 JSON，兼容模拟轨迹和路线规划原来的代码
function createAttractionOptionForRouteTrack(feature) {
    const name = getAttractionName(feature);
    const province = getAttractionProvince(feature);
    const city = getAttractionCity(feature);
    const category = getAttractionCategory(feature);
    const coord = feature.getGeometry().getCoordinates();

    const option = document.createElement('option');

    option.value = JSON.stringify(coord);
    option.textContent = province + ' ' + city + ' · ' + name + '（' + category + '）';

    option.dataset.name = name;
    option.dataset.province = province;
    option.dataset.city = city;
    option.dataset.category = category;
    option.dataset.lon = coord[0];
    option.dataset.lat = coord[1];

    return option;
}


// 填充一个 select
function fillRouteTrackSelect(select, placeholderText) {
    if (!select) {
        return;
    }

    const oldValue = select.value;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = placeholderText || '请选择景点';
    select.appendChild(placeholder);

    const features = getNewestAttractionFeaturesForRouteTrack();

    features.forEach(function(feature) {
        select.appendChild(createAttractionOptionForRouteTrack(feature));
    });

    // 尽量保留原来的选择
    if (oldValue) {
        select.value = oldValue;
    }
}


// 强制刷新模拟轨迹下拉列表
function forceRefreshTrackSelects() {
    // 下面这三个 id 是你之前模拟轨迹里常见的下拉框 id
    const trackOrigin = document.getElementById('trackOrigin');
    const trackWaypoints = document.getElementById('trackWaypoints');
    const trackDestination = document.getElementById('trackDestination');

    fillRouteTrackSelect(trackOrigin, '-- 请选择起点 --');
    fillRouteTrackSelect(trackWaypoints, '-- 请选择途经点 --');
    fillRouteTrackSelect(trackDestination, '-- 请选择终点 --');

    // 如果你原来有已选信息刷新函数，继续调用
    if (typeof updateTrackSelectedInfo === 'function') {
        updateTrackSelectedInfo();
    }
}


// 强制刷新路线规划下拉列表
function forceRefreshRouteSelects() {
    // 下面这两个 id 是你之前路线规划里常见的下拉框 id
    const routeOriginSelect = document.getElementById('routeOriginSelect');
    const routeDestination = document.getElementById('routeDestination');

    fillRouteTrackSelect(routeOriginSelect, '-- 请选择起点景点 --');
    fillRouteTrackSelect(routeDestination, '-- 请选择目的地景点 --');
}


// 同时刷新模拟轨迹和路线规划
function forceRefreshRouteAndTrackSelects() {
    forceRefreshTrackSelects();
    forceRefreshRouteSelects();

    // 顺手刷新右侧景点查询下拉框
    if (typeof refreshAttractionQueryDropdown === 'function') {
        refreshAttractionQueryDropdown();
    }
}

// 打开模拟轨迹 / 路线规划窗口时，强制刷新下拉列表
function bindRouteTrackModalRefreshEvents() {
    const routeModal = document.getElementById('routeModal');
    const trackModal = document.getElementById('trackModal');

    if (routeModal && !routeModal.dataset.forceRefreshBinded) {
        routeModal.addEventListener('show.bs.modal', function() {
            forceRefreshRouteSelects();
        });

        routeModal.addEventListener('shown.bs.modal', function() {
            forceRefreshRouteSelects();
        });

        routeModal.dataset.forceRefreshBinded = 'true';
    }

    if (trackModal && !trackModal.dataset.forceRefreshBinded) {
        trackModal.addEventListener('show.bs.modal', function() {
            forceRefreshTrackSelects();
        });

        trackModal.addEventListener('shown.bs.modal', function() {
            forceRefreshTrackSelects();
        });

        trackModal.dataset.forceRefreshBinded = 'true';
    }
}


// 页面加载后多次刷新，防止新增景点还没加载完成
setTimeout(function() {
    forceRefreshRouteAndTrackSelects();
    bindRouteTrackModalRefreshEvents();
}, 1000);

setTimeout(function() {
    forceRefreshRouteAndTrackSelects();
    bindRouteTrackModalRefreshEvents();
}, 2500);

setTimeout(function() {
    forceRefreshRouteAndTrackSelects();
    bindRouteTrackModalRefreshEvents();
}, 4500);

// ===============================
// 强制刷新路线规划景点下拉列表
// 使用 attractionsSource 最新景点数据
// ===============================

// 获取路线规划使用的最新景点列表
function getRoutePlanLatestAttractions() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return [];
    }

    // 确保后续新增景点已经加入
    if (typeof supplementProvinceCityAttractions === 'function') {
        supplementProvinceCityAttractions();
    }

    if (typeof normalizeAttractionCategories === 'function') {
        normalizeAttractionCategories();
    }

    if (typeof assignRandomRatingsToAttractions === 'function') {
        assignRandomRatingsToAttractions();
    }

    const nameMap = new Map();

    attractionsSource.getFeatures().forEach(function(feature) {
        if (!feature.getGeometry()) {
            return;
        }

        const name = getAttractionName(feature);
        const province = getAttractionProvince(feature);
        const city = getAttractionCity(feature);

        feature.set('province', province);
        feature.set('city', city);

        // 只按名称去重，不额外过滤景点
        if (!nameMap.has(name)) {
            nameMap.set(name, feature);
        }
    });

    const features = Array.from(nameMap.values());

    features.sort(function(a, b) {
        const textA = getAttractionProvince(a) + getAttractionCity(a) + getAttractionName(a);
        const textB = getAttractionProvince(b) + getAttractionCity(b) + getAttractionName(b);

        return textA.localeCompare(textB, 'zh-CN');
    });

    return features;
}


// 创建路线规划下拉选项
function createRoutePlanOption(feature) {
    const name = getAttractionName(feature);
    const province = getAttractionProvince(feature);
    const city = getAttractionCity(feature);
    const category = getAttractionCategory(feature);
    const coord = feature.getGeometry().getCoordinates();

    const option = document.createElement('option');

    // 保持坐标 JSON，兼容你原来的路线规划逻辑
    option.value = JSON.stringify(coord);

    option.textContent = province + ' ' + city + ' · ' + name + '（' + category + '）';

    option.dataset.name = name;
    option.dataset.province = province;
    option.dataset.city = city;
    option.dataset.category = category;
    option.dataset.lon = coord[0];
    option.dataset.lat = coord[1];

    return option;
}


// 判断路线规划弹窗里的 select 是否是景点选择框
function isRoutePlanAttractionSelect(select) {
    if (!select) {
        return false;
    }

    const id = (select.id || '').toLowerCase();
    const name = (select.name || '').toLowerCase();
    const text = (select.parentElement ? select.parentElement.innerText : '').toLowerCase();

    // 明确排除路线方式、交通方式之类的 select
    if (
        id.includes('mode') ||
        id.includes('type') ||
        id.includes('method') ||
        text.includes('驾车') ||
        text.includes('步行') ||
        text.includes('骑行')
    ) {
        return false;
    }

    // 路线规划里常见的起点、终点、目的地选择框
    return (
        id.includes('origin') ||
        id.includes('start') ||
        id.includes('destination') ||
        id.includes('end') ||
        id.includes('attraction') ||
        text.includes('起点') ||
        text.includes('终点') ||
        text.includes('目的地') ||
        text.includes('景点')
    );
}


// 填充路线规划单个 select
function fillRoutePlanSelect(select, placeholderText) {
    if (!select) {
        return;
    }

    const oldValue = select.value;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = placeholderText || '-- 请选择景点 --';
    select.appendChild(placeholder);

    const features = getRoutePlanLatestAttractions();

    features.forEach(function(feature) {
        select.appendChild(createRoutePlanOption(feature));
    });

    // 尽量保留原选择
    if (oldValue) {
        select.value = oldValue;
    }
}


// 强制刷新路线规划弹窗中的所有景点下拉框
function forceRefreshRoutePlanningDropdowns() {
    const routeModal = document.getElementById('routeModal');

    if (!routeModal) {
        console.warn('没有找到 routeModal，请检查路线规划弹窗 id。');
        return;
    }

    const selects = routeModal.querySelectorAll('select');

    selects.forEach(function(select) {
        if (isRoutePlanAttractionSelect(select)) {
            let placeholder = '-- 请选择景点 --';

            const text = (select.parentElement ? select.parentElement.innerText : '');

            if (text.indexOf('起点') !== -1 || select.id.toLowerCase().includes('origin') || select.id.toLowerCase().includes('start')) {
                placeholder = '-- 请选择起点景点 --';
            }

            if (text.indexOf('终点') !== -1 || text.indexOf('目的地') !== -1 || select.id.toLowerCase().includes('destination') || select.id.toLowerCase().includes('end')) {
                placeholder = '-- 请选择目的地景点 --';
            }

            fillRoutePlanSelect(select, placeholder);
        }
    });
}

// 打开路线规划窗口时，延迟多次刷新，防止旧函数再次覆盖
function bindRoutePlanningDropdownRefresh() {
    const routeModal = document.getElementById('routeModal');

    if (!routeModal || routeModal.dataset.routeRefreshBinded) {
        return;
    }

    routeModal.addEventListener('show.bs.modal', function() {
        forceRefreshRoutePlanningDropdowns();

        setTimeout(function() {
            forceRefreshRoutePlanningDropdowns();
        }, 100);

        setTimeout(function() {
            forceRefreshRoutePlanningDropdowns();
        }, 400);
    });

    routeModal.addEventListener('shown.bs.modal', function() {
        forceRefreshRoutePlanningDropdowns();

        setTimeout(function() {
            forceRefreshRoutePlanningDropdowns();
        }, 100);

        setTimeout(function() {
            forceRefreshRoutePlanningDropdowns();
        }, 400);
    });

    routeModal.dataset.routeRefreshBinded = 'true';
}


// 覆盖旧的 populateAttractionsForRoute，避免它再次读取旧数据
function populateAttractionsForRoute() {
    forceRefreshRoutePlanningDropdowns();
}


// 页面加载后多次刷新路线规划下拉框
setTimeout(function() {
    bindRoutePlanningDropdownRefresh();
    forceRefreshRoutePlanningDropdowns();
}, 1000);

setTimeout(function() {
    bindRoutePlanningDropdownRefresh();
    forceRefreshRoutePlanningDropdowns();
}, 2500);

setTimeout(function() {
    bindRoutePlanningDropdownRefresh();
    forceRefreshRoutePlanningDropdowns();
}, 4500);

// ===== 统一识别景点省份：新版 =====
function getAttractionProvince(feature) {
    const name = getAttractionName(feature);

    // 先按名称精确识别，避免旧数据里的“其他省份”继续生效
    if (['故宫', '八达岭', '长城', '天坛', '颐和园'].some(key => name.indexOf(key) !== -1)) return '北京';
    if (['秦始皇陵兵马俑', '西安城墙', '大雁塔', '华清宫', '华山'].some(key => name.indexOf(key) !== -1)) return '陕西';
    if (['西湖', '灵隐寺', '宋城'].some(key => name.indexOf(key) !== -1)) return '浙江';
    if (['苏州园林', '拙政园', '狮子林', '留园', '虎丘'].some(key => name.indexOf(key) !== -1)) return '江苏';
    if (['黄山', '宏村', '西递'].some(key => name.indexOf(key) !== -1)) return '安徽';
    if (['桂林', '漓江', '阳朔'].some(key => name.indexOf(key) !== -1)) return '广西';
    if (['丽江', '玉龙雪山', '大理', '束河', '崇圣寺三塔'].some(key => name.indexOf(key) !== -1)) return '云南';
    if (['鼓浪屿', '厦门', '武夷山', '土楼'].some(key => name.indexOf(key) !== -1)) return '福建';
    if (['九寨沟', '黄龙', '都江堰', '峨眉山'].some(key => name.indexOf(key) !== -1)) return '四川';
    if (['平遥', '云冈', '五台山'].some(key => name.indexOf(key) !== -1)) return '山西';
    if (['龙门石窟', '少林寺', '清明上河园'].some(key => name.indexOf(key) !== -1)) return '河南';
    if (['泰山', '曲阜', '三孔', '趵突泉'].some(key => name.indexOf(key) !== -1)) return '山东';
    if (['张家界', '岳阳楼', '凤凰古城'].some(key => name.indexOf(key) !== -1)) return '湖南';
    if (['黄鹤楼', '武当山', '三峡大坝'].some(key => name.indexOf(key) !== -1)) return '湖北';
    if (['广州塔', '陈家祠', '丹霞山'].some(key => name.indexOf(key) !== -1)) return '广东';
    if (['布达拉宫'].some(key => name.indexOf(key) !== -1)) return '西藏';
    if (['承德避暑山庄'].some(key => name.indexOf(key) !== -1)) return '河北';

    const province = feature.get('province') || feature.get('省份') || '';

    if (province && province !== '其他省份') {
        return province;
    }

    return '其他省份';
}


// ===== 统一识别景点城市：新版 =====
function getAttractionCity(feature) {
    const name = getAttractionName(feature);

    // 先按名称精确识别，避免旧数据里的“其他城市”继续生效
    if (['故宫', '八达岭', '长城', '天坛', '颐和园'].some(key => name.indexOf(key) !== -1)) return '北京';
    if (['秦始皇陵兵马俑', '西安城墙', '大雁塔', '华清宫'].some(key => name.indexOf(key) !== -1)) return '西安';
    if (['华山'].some(key => name.indexOf(key) !== -1)) return '渭南';
    if (['西湖', '灵隐寺', '宋城'].some(key => name.indexOf(key) !== -1)) return '杭州';
    if (['苏州园林', '拙政园', '狮子林', '留园', '虎丘'].some(key => name.indexOf(key) !== -1)) return '苏州';
    if (['黄山', '宏村', '西递'].some(key => name.indexOf(key) !== -1)) return '黄山';
    if (['桂林', '漓江', '阳朔'].some(key => name.indexOf(key) !== -1)) return '桂林';
    if (['丽江', '玉龙雪山', '束河'].some(key => name.indexOf(key) !== -1)) return '丽江';
    if (['大理', '崇圣寺三塔'].some(key => name.indexOf(key) !== -1)) return '大理';
    if (['鼓浪屿', '厦门'].some(key => name.indexOf(key) !== -1)) return '厦门';
    if (['武夷山'].some(key => name.indexOf(key) !== -1)) return '武夷山';
    if (['土楼'].some(key => name.indexOf(key) !== -1)) return '龙岩';
    if (['九寨沟', '黄龙'].some(key => name.indexOf(key) !== -1)) return '阿坝';
    if (['都江堰'].some(key => name.indexOf(key) !== -1)) return '成都';
    if (['峨眉山'].some(key => name.indexOf(key) !== -1)) return '乐山';
    if (['平遥'].some(key => name.indexOf(key) !== -1)) return '晋中';
    if (['云冈'].some(key => name.indexOf(key) !== -1)) return '大同';
    if (['五台山'].some(key => name.indexOf(key) !== -1)) return '忻州';
    if (['龙门石窟'].some(key => name.indexOf(key) !== -1)) return '洛阳';
    if (['少林寺'].some(key => name.indexOf(key) !== -1)) return '郑州';
    if (['清明上河园'].some(key => name.indexOf(key) !== -1)) return '开封';
    if (['泰山'].some(key => name.indexOf(key) !== -1)) return '泰安';
    if (['曲阜', '三孔'].some(key => name.indexOf(key) !== -1)) return '济宁';
    if (['趵突泉'].some(key => name.indexOf(key) !== -1)) return '济南';
    if (['张家界'].some(key => name.indexOf(key) !== -1)) return '张家界';
    if (['岳阳楼'].some(key => name.indexOf(key) !== -1)) return '岳阳';
    if (['凤凰古城'].some(key => name.indexOf(key) !== -1)) return '湘西';
    if (['黄鹤楼'].some(key => name.indexOf(key) !== -1)) return '武汉';
    if (['武当山'].some(key => name.indexOf(key) !== -1)) return '十堰';
    if (['三峡大坝'].some(key => name.indexOf(key) !== -1)) return '宜昌';
    if (['广州塔', '陈家祠'].some(key => name.indexOf(key) !== -1)) return '广州';
    if (['丹霞山'].some(key => name.indexOf(key) !== -1)) return '韶关';
    if (['布达拉宫'].some(key => name.indexOf(key) !== -1)) return '拉萨';
    if (['承德避暑山庄'].some(key => name.indexOf(key) !== -1)) return '承德';

    const city = feature.get('city') || feature.get('城市') || feature.get('area') || feature.get('地区') || '';

    if (city && city !== '其他城市') {
        return city;
    }

    return '其他城市';
}

// ===== 把识别出来的省份、城市统一写回景点属性 =====
function normalizeAttractionProvinceCityFields() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    attractionsSource.getFeatures().forEach(function(feature) {
        if (!feature.getGeometry()) {
            return;
        }

        const province = getAttractionProvince(feature);
        const city = getAttractionCity(feature);

        feature.set('province', province);
        feature.set('city', city);
    });
}

// ===== 刷新右侧“景点查询”下拉列表 =====
function refreshAttractionQueryDropdown() {
    const menu = document.getElementById('attractionQueryMenu');
    const button = document.getElementById('attractionQueryButton');

    if (!menu) {
        return;
    }

    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    normalizeAttractionProvinceCityFields();

    const features = attractionsSource.getFeatures().filter(function(feature) {
        return feature.getGeometry();
    });

    const nameMap = new Map();

    features.forEach(function(feature) {
        const name = getAttractionName(feature);

        if (!nameMap.has(name)) {
            nameMap.set(name, feature);
        }
    });

    const uniqueFeatures = Array.from(nameMap.values());

    uniqueFeatures.sort(function(a, b) {
        const textA = getAttractionProvince(a) + getAttractionCity(a) + getAttractionName(a);
        const textB = getAttractionProvince(b) + getAttractionCity(b) + getAttractionName(b);

        return textA.localeCompare(textB, 'zh-CN');
    });

    window.attractionQueryFeatureList = uniqueFeatures;

    menu.innerHTML = '';

    uniqueFeatures.forEach(function(feature, index) {
        const name = getAttractionName(feature);
        const province = getAttractionProvince(feature);
        const city = getAttractionCity(feature);

        const li = document.createElement('li');
        const a = document.createElement('a');

        a.className = 'dropdown-item';
        a.href = '#';
        a.textContent = province + ' ' + city + ' · ' + name;

        a.onclick = function(event) {
            event.preventDefault();

            if (button) {
                button.textContent = name;
            }

            selectAttractionFromQueryDropdown(index);
        };

        li.appendChild(a);
        menu.appendChild(li);
    });
}

// ===== 根据最新景点数据刷新游览计划的省份和城市下拉框 =====
function refreshTravelPlanProvinceCityDropdowns() {
    const provinceSelect = document.getElementById('travelPlanProvince');
    const citySelect = document.getElementById('travelPlanCity');

    if (!provinceSelect || !citySelect) {
        return;
    }

    normalizeAttractionProvinceCityFields();

    const oldProvince = provinceSelect.value || 'all';
    const oldCity = citySelect.value || 'all';

    const provinceSet = new Set();

    attractionsSource.getFeatures().forEach(function(feature) {
        if (!feature.getGeometry()) {
            return;
        }

        const province = getAttractionProvince(feature);

        if (province && province !== '其他省份') {
            provinceSet.add(province);
        }
    });

    const provinces = Array.from(provinceSet).sort(function(a, b) {
        return a.localeCompare(b, 'zh-CN');
    });

    provinceSelect.innerHTML = '<option value="all">全部省份 / 区域</option>';

    provinces.forEach(function(province) {
        const option = document.createElement('option');
        option.value = province;
        option.textContent = province;
        provinceSelect.appendChild(option);
    });

    if (oldProvince && Array.from(provinceSelect.options).some(option => option.value === oldProvince)) {
        provinceSelect.value = oldProvince;
    } else {
        provinceSelect.value = 'all';
    }

    refreshTravelPlanCityDropdownOnly(oldCity);
}


// 单独刷新城市下拉框
function refreshTravelPlanCityDropdownOnly(oldCityValue) {
    const provinceSelect = document.getElementById('travelPlanProvince');
    const citySelect = document.getElementById('travelPlanCity');

    if (!provinceSelect || !citySelect) {
        return;
    }

    normalizeAttractionProvinceCityFields();

    const province = provinceSelect.value;
    const citySet = new Set();

    attractionsSource.getFeatures().forEach(function(feature) {
        if (!feature.getGeometry()) {
            return;
        }

        const featureProvince = getAttractionProvince(feature);
        const city = getAttractionCity(feature);

        if (city && city !== '其他城市') {
            if (province === 'all' || featureProvince === province) {
                citySet.add(city);
            }
        }
    });

    const cities = Array.from(citySet).sort(function(a, b) {
        return a.localeCompare(b, 'zh-CN');
    });

    citySelect.innerHTML = '<option value="all">全部城市 / 区域</option>';

    cities.forEach(function(city) {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        citySelect.appendChild(option);
    });

    if (oldCityValue && Array.from(citySelect.options).some(option => option.value === oldCityValue)) {
        citySelect.value = oldCityValue;
    } else {
        citySelect.value = 'all';
    }
}


// 覆盖旧的 updateTravelPlanCityOptions
function updateTravelPlanCityOptions() {
    refreshTravelPlanCityDropdownOnly('all');
}

// ===== 统一刷新查询分析区相关下拉列表 =====
function refreshAllQueryAnalysisDropdowns() {
    // 1. 写回省份城市
    normalizeAttractionProvinceCityFields();

    // 2. 刷新景点查询下拉框
    if (typeof refreshAttractionQueryDropdown === 'function') {
        refreshAttractionQueryDropdown();
    }

    // 3. 刷新游览计划省份城市下拉框
    if (typeof refreshTravelPlanProvinceCityDropdowns === 'function') {
        refreshTravelPlanProvinceCityDropdowns();
    }

    // 4. 如果你前面已经加了路线规划刷新，也一起刷新
    if (typeof forceRefreshRoutePlanningDropdowns === 'function') {
        forceRefreshRoutePlanningDropdowns();
    }

    // 5. 如果你前面已经加了模拟轨迹刷新，也一起刷新
    if (typeof forceRefreshTrackSelects === 'function') {
        forceRefreshTrackSelects();
    }
}


// 页面加载后多次刷新，防止景点数据加载顺序导致不完整
setTimeout(function() {
    refreshAllQueryAnalysisDropdowns();
}, 1000);

setTimeout(function() {
    refreshAllQueryAnalysisDropdowns();
}, 2500);

setTimeout(function() {
    refreshAllQueryAnalysisDropdowns();
}, 4500);

// ===============================
// GitHub Pages 版收藏夹：兼容 attractionId 的 localStorage 收藏功能
// ===============================

const LOCAL_FAVORITES_KEY = 'zhiyou_mingcheng_favorites';

// 读取收藏夹
function getLocalFavorites() {
    const data = localStorage.getItem(LOCAL_FAVORITES_KEY);

    if (!data) {
        return [];
    }

    try {
        return JSON.parse(data);
    } catch (e) {
        localStorage.removeItem(LOCAL_FAVORITES_KEY);
        return [];
    }
}

// 保存收藏夹
function saveLocalFavorites(favorites) {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
}

// 获取景点名称
function getFavoriteName(feature) {
    return (
        feature.get('name') ||
        feature.get('title') ||
        feature.get('名称') ||
        feature.get('id') ||
        '未命名景点'
    );
}

// 根据 attractionId 找到对应景点
function findFeatureByAttractionId(attractionId) {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return null;
    }

    const targetId = String(attractionId);

    return attractionsSource.getFeatures().find(function(feature) {
        const ids = [
            feature.get('id'),
            feature.get('attractionId'),
            feature.get('name'),
            feature.get('title'),
            feature.get('名称')
        ];

        return ids.some(function(item) {
            return String(item) === targetId;
        });
    });
}

// 判断是否已经收藏
function isFavorite(attractionId) {
    const favorites = getLocalFavorites();

    return favorites.some(function(item) {
        return String(item.id) === String(attractionId);
    });
}

// 切换收藏状态
// 兼容你现在按钮里的 onclick="toggleFavorite('xxx')"
function toggleFavorite(attractionId) {
    const feature = findFeatureByAttractionId(attractionId);

    if (!feature) {
        alert('没有找到该景点，无法收藏。');
        return;
    }

    let favorites = getLocalFavorites();

    const exists = favorites.some(function(item) {
        return String(item.id) === String(attractionId);
    });

    const name = getFavoriteName(feature);

    if (exists) {
        favorites = favorites.filter(function(item) {
            return String(item.id) !== String(attractionId);
        });

        saveLocalFavorites(favorites);
        alert('已取消收藏：' + name);
    } else {
        const geometry = feature.getGeometry();
        const coord = geometry ? geometry.getCoordinates() : null;

        favorites.push({
            id: attractionId,
            name: name,
            province: typeof getAttractionProvince === 'function' ? getAttractionProvince(feature) : (feature.get('province') || ''),
            city: typeof getAttractionCity === 'function' ? getAttractionCity(feature) : (feature.get('city') || ''),
            category: typeof getAttractionCategory === 'function' ? getAttractionCategory(feature) : (feature.get('category') || '景点'),
            description: feature.get('description') || feature.get('desc') || feature.get('简介') || '',
            rating: feature.get('rating') || feature.get('score') || feature.get('评分') || '',
            coordinate: coord,
            createdAt: new Date().toLocaleString()
        });

        saveLocalFavorites(favorites);
        alert('已收藏：' + name);
    }

    updateFavoriteButton(attractionId);
}

// 更新收藏按钮状态
function updateFavoriteButton(attractionId) {
    const btn = document.getElementById('favoriteBtn');

    if (!btn) {
        return;
    }

    if (isFavorite(attractionId)) {
        btn.innerHTML = '⭐ 已收藏';
        btn.classList.add('btn-warning');
        btn.classList.remove('btn-outline-warning');
    } else {
        btn.innerHTML = '⭐ 收藏';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-outline-warning');
    }
}

// 显示收藏夹
function showFavorites() {
    const favorites = getLocalFavorites();

    let panel = document.getElementById('favoritesPanel');

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'favoritesPanel';
        panel.className = 'favorites-panel';
        document.body.appendChild(panel);
    }

    if (favorites.length === 0) {
        panel.innerHTML = `
            <button type="button" class="btn-close float-end" onclick="closeFavoritesPanel()"></button>
            <h5>我的收藏夹</h5>
            <div style="clear:both;"></div>
            <p style="margin-top:15px;">暂无收藏景点。</p>
        `;
        panel.style.display = 'block';
        return;
    }

    let html = `
        <button type="button" class="btn-close float-end" onclick="closeFavoritesPanel()"></button>
        <h5>我的收藏夹</h5>
        <div style="clear:both;"></div>
    `;

    favorites.forEach(function(item) {
        html += `
            <div class="favorite-item" style="border-bottom:1px dashed #c9a227;padding:10px 0;">
                <div style="font-weight:bold;color:#b22126;">${item.name}</div>
                <div style="font-size:13px;margin-top:4px;">
                    ${item.province || ''} ${item.city || ''} · ${item.category || '景点'}
                </div>
                <div style="font-size:13px;color:#666;margin-top:4px;">
                    ${item.description || '暂无简介'}
                </div>
                <div style="margin-top:8px;">
                    <button class="btn btn-sm btn-outline-primary" onclick="locateFavoriteAttraction('${String(item.id).replace(/'/g, "\\'")}')">
                        定位
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeFavorite('${String(item.id).replace(/'/g, "\\'")}')">
                        删除
                    </button>
                </div>
            </div>
        `;
    });

    html += `
        <button class="btn btn-sm btn-outline-danger w-100 mt-3" onclick="clearAllFavorites()">
            清空收藏夹
        </button>
    `;

    panel.innerHTML = html;
    panel.style.display = 'block';
}

// 删除单个收藏
function removeFavorite(attractionId) {
    let favorites = getLocalFavorites();

    favorites = favorites.filter(function(item) {
        return String(item.id) !== String(attractionId);
    });

    saveLocalFavorites(favorites);
    showFavorites();
}

// 关闭收藏夹
function closeFavoritesPanel() {
    const panel = document.getElementById('favoritesPanel');

    if (panel) {
        panel.style.display = 'none';
    }
}

// 清空收藏夹
function clearAllFavorites() {
    if (!confirm('确定要清空所有收藏吗？')) {
        return;
    }

    localStorage.removeItem(LOCAL_FAVORITES_KEY);
    showFavorites();
}

// 定位收藏景点
function locateFavoriteAttraction(attractionId) {
    const feature = findFeatureByAttractionId(attractionId);

    if (!feature || !feature.getGeometry()) {
        alert('没有找到该收藏景点的位置。');
        return;
    }

    const coord = feature.getGeometry().getCoordinates();

    map.getView().animate({
        center: coord,
        zoom: 13,
        duration: 600
    });

    closeFavoritesPanel();

    setTimeout(function() {
        const pixel = map.getPixelFromCoordinate(coord);

        map.dispatchEvent({
            type: 'singleclick',
            coordinate: coord,
            pixel: pixel,
            dragging: false
        });
    }, 300);
}

// 兼容线上部署：修复旧代码中调用 fixCustomAttractionData 报错的问题
function fixCustomAttractionData() {
    if (typeof supplementProvinceCityAttractions === 'function') {
        supplementProvinceCityAttractions();
    }

    if (typeof normalizeAttractionCategories === 'function') {
        normalizeAttractionCategories();
    }

    if (typeof normalizeAttractionProvinceCityFields === 'function') {
        normalizeAttractionProvinceCityFields();
    }

    if (typeof refreshAllQueryAnalysisDropdowns === 'function') {
        refreshAllQueryAnalysisDropdowns();
    }
}



// =====================================================
// 景点去重：防止 data 和 main.js 补充数据重复添加同名景点
// 例如：桂林山水重复出现时，只保留第一个
// =====================================================
function removeDuplicateAttractionsByName() {
    if (typeof attractionsSource === 'undefined' || !attractionsSource) {
        return;
    }

    const seenNames = new Set();
    const duplicateFeatures = [];

    attractionsSource.getFeatures().forEach(function(feature) {
        const name =
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            '';

        if (!name) {
            return;
        }

        if (seenNames.has(name)) {
            duplicateFeatures.push(feature);
        } else {
            seenNames.add(name);
        }
    });

    duplicateFeatures.forEach(function(feature) {
        attractionsSource.removeFeature(feature);
    });

    if (duplicateFeatures.length > 0) {
        console.log(
            '已清理重复景点：',
            duplicateFeatures.map(function(feature) {
                return feature.get('name') || feature.get('title') || feature.get('名称');
            })
        );
    }

    // 去重后刷新右侧景点下拉
    if (typeof refreshAttractionQueryDropdown === 'function') {
        refreshAttractionQueryDropdown();
    }

    // 去重后刷新路线规划下拉
    if (typeof forceRefreshRoutePlanningDropdowns === 'function') {
        forceRefreshRoutePlanningDropdowns();
    }

    // 去重后刷新模拟轨迹下拉
    if (typeof forceRefreshTrackSelects === 'function') {
        forceRefreshTrackSelects();
    }
}

// 多执行几次，防止后面的补充数据函数又把重复景点加回来
setTimeout(removeDuplicateAttractionsByName, 800);
setTimeout(removeDuplicateAttractionsByName, 1800);
setTimeout(removeDuplicateAttractionsByName, 3500);
setTimeout(removeDuplicateAttractionsByName, 6000);

// =====================================================
// GitHub Pages 路线规划 / 模拟轨迹最终修复版
// 作用：
// 1. 路线不再是大圆弧，而是折线路线
// 2. 轨迹播放速度变慢
// 3. 路线最后一个点强制落在终点景点坐标上
// 请放在 main.js 最下面
// =====================================================
(function () {
    if (window.__staticRouteFinalPatchInstalled) {
        return;
    }

    window.__staticRouteFinalPatchInstalled = true;

    const oldFetch = window.fetch.bind(window);

    function makeJsonResponse(data) {
        return Promise.resolve(
            new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            })
        );
    }

    function getUrlParam(urlText, key) {
        try {
            const query = urlText.split('?')[1] || '';
            const params = new URLSearchParams(query);
            return params.get(key) || '';
        } catch (e) {
            return '';
        }
    }

    // 支持 [110,25]、110,25、"110.1,25.2" 这几种坐标格式
    function parseCoordinateText(text) {
        if (!text) {
            return null;
        }

        text = decodeURIComponent(String(text)).trim();

        try {
            const jsonValue = JSON.parse(text);
            if (
                Array.isArray(jsonValue) &&
                jsonValue.length >= 2 &&
                !isNaN(Number(jsonValue[0])) &&
                !isNaN(Number(jsonValue[1]))
            ) {
                return [Number(jsonValue[0]), Number(jsonValue[1])];
            }
        } catch (e) {}

        const match = text.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);

        if (match) {
            const lon = Number(match[1]);
            const lat = Number(match[3]);

            if (!isNaN(lon) && !isNaN(lat)) {
                return [lon, lat];
            }
        }

        return null;
    }

    function getFeatureName(feature) {
        if (!feature) {
            return '';
        }

        return (
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            feature.get('id') ||
            ''
        );
    }

    // 根据景点名称找到坐标
    function findAttractionCoordinateByName(nameText) {
        if (!nameText || typeof attractionsSource === 'undefined' || !attractionsSource) {
            return null;
        }

        const keyword = decodeURIComponent(String(nameText)).trim();

        if (!keyword) {
            return null;
        }

        const features = attractionsSource.getFeatures();

        let foundFeature = features.find(function (feature) {
            const name = getFeatureName(feature);
            return name === keyword;
        });

        if (!foundFeature) {
            foundFeature = features.find(function (feature) {
                const name = getFeatureName(feature);
                return name && (name.includes(keyword) || keyword.includes(name));
            });
        }

        if (foundFeature && foundFeature.getGeometry()) {
            const coord = foundFeature.getGeometry().getCoordinates();
            return [Number(coord[0]), Number(coord[1])];
        }

        return null;
    }

    function resolveRoutePoint(text) {
        return parseCoordinateText(text) || findAttractionCoordinateByName(text);
    }

    function calculateDistanceMeters(coord1, coord2) {
        if (
            typeof ol !== 'undefined' &&
            ol.sphere &&
            typeof ol.sphere.getDistance === 'function'
        ) {
            return ol.sphere.getDistance(coord1, coord2);
        }

        const dx = coord1[0] - coord2[0];
        const dy = coord1[1] - coord2[1];

        return Math.sqrt(dx * dx + dy * dy) * 111000;
    }

    // 把一个线段拆成很多点，点越多，模拟轨迹播放越慢
    function densifySegment(start, end, count) {
        const coords = [];

        for (let i = 0; i <= count; i++) {
            const t = i / count;

            const lon = start[0] + (end[0] - start[0]) * t;
            const lat = start[1] + (end[1] - start[1]) * t;

            coords.push([
                Number(lon.toFixed(6)),
                Number(lat.toFixed(6))
            ]);
        }

        return coords;
    }

    // 生成不那么平滑的折线路径
    function createBrokenLineRoute(start, end) {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];

        // 远距离路线多给几个折点，避免一条大弧线
        const p1 = [
            start[0] + dx * 0.25,
            start[1] + dy * 0.08
        ];

        const p2 = [
            start[0] + dx * 0.48,
            start[1] + dy * 0.42
        ];

        const p3 = [
            start[0] + dx * 0.72,
            start[1] + dy * 0.70
        ];

        const keyPoints = [
            start,
            p1,
            p2,
            p3,
            end
        ];

        let result = [];

        for (let i = 0; i < keyPoints.length - 1; i++) {
            const segment = densifySegment(keyPoints[i], keyPoints[i + 1], 28);

            if (i > 0) {
                segment.shift();
            }

            result = result.concat(segment);
        }

        // 关键：最后一个点强制等于终点坐标
        result[result.length - 1] = [
            Number(end[0].toFixed(6)),
            Number(end[1].toFixed(6))
        ];

        return result;
    }

    // 多个景点：起点 -> 途经点 -> 终点
    function createRouteThroughPoints(points) {
        let result = [];

        for (let i = 0; i < points.length - 1; i++) {
            const part = createBrokenLineRoute(points[i], points[i + 1]);

            if (i > 0) {
                part.shift();
            }

            result = result.concat(part);
        }

        const finalPoint = points[points.length - 1];

        // 再次强制最后落点为终点景点
        result[result.length - 1] = [
            Number(finalPoint[0].toFixed(6)),
            Number(finalPoint[1].toFixed(6))
        ];

        return result;
    }

    function coordsToPolyline(coords) {
        return coords.map(function (coord) {
            return coord[0] + ',' + coord[1];
        }).join(';');
    }

    function parseWaypoints(urlText) {
        const waypointText =
            getUrlParam(urlText, 'waypoints') ||
            getUrlParam(urlText, 'waypoint') ||
            getUrlParam(urlText, 'via') ||
            '';

        if (!waypointText) {
            return [];
        }

        const decoded = decodeURIComponent(waypointText);

        return decoded
            .split(/[;|]/)
            .map(function (item) {
                return resolveRoutePoint(item);
            })
            .filter(function (coord) {
                return coord && coord.length >= 2;
            });
    }

    function createStaticRouteResponse(urlText) {
        const originText =
            getUrlParam(urlText, 'origin') ||
            getUrlParam(urlText, 'start') ||
            getUrlParam(urlText, 'from') ||
            '';

        const destinationText =
            getUrlParam(urlText, 'destination') ||
            getUrlParam(urlText, 'end') ||
            getUrlParam(urlText, 'to') ||
            '';

        let start = resolveRoutePoint(originText);
        let end = resolveRoutePoint(destinationText);
        const waypoints = parseWaypoints(urlText);

        if (!start && typeof map !== 'undefined') {
            start = map.getView().getCenter();
        }

        if (!end && typeof map !== 'undefined') {
            const center = map.getView().getCenter();
            end = [center[0] + 0.05, center[1] + 0.05];
        }

        if (!start) {
            start = [116.397, 39.908];
        }

        if (!end) {
            end = [116.407, 39.918];
        }

        const routePoints = [start].concat(waypoints).concat([end]);

        const routeCoords = createRouteThroughPoints(routePoints);

        let totalDistance = 0;

        for (let i = 0; i < routePoints.length - 1; i++) {
            totalDistance += calculateDistanceMeters(routePoints[i], routePoints[i + 1]);
        }

        // 时间故意放大一些，让“播放轨迹”慢一点
        const duration = Math.max(1200, totalDistance / 4);

        return {
            status: '1',
            info: 'GitHub Pages 静态折线路线',
            route: {
                origin: start.join(','),
                destination: end.join(','),
                paths: [
                    {
                        distance: String(Math.round(totalDistance)),
                        duration: String(Math.round(duration)),
                        strategy: '静态模拟折线路线',
                        steps: [
                            {
                                instruction: '沿静态模拟路线行进',
                                road: '模拟旅游路线',
                                distance: String(Math.round(totalDistance)),
                                duration: String(Math.round(duration)),
                                polyline: coordsToPolyline(routeCoords)
                            }
                        ]
                    }
                ]
            }
        };
    }

    // 最终拦截 /api/route
    // 这个放在 main.js 最下面，所以优先级比前面的补丁更高
    window.fetch = function (input, init) {
        const urlText = typeof input === 'string'
            ? input
            : input && input.url
                ? input.url
                : '';

        const lowerUrl = urlText.toLowerCase();

        if (lowerUrl.includes('api/route')) {
            return makeJsonResponse(createStaticRouteResponse(urlText));
        }

        return oldFetch(input, init);
    };

    // 给可能存在的全局速度变量降速
    window.trackPlaybackSpeed = 0.45;
    window.trackSpeed = 0.45;
    window.routeAnimationSpeed = 0.45;
})();

// =====================================================
// 高德 API 稳定接入版：路线规划 / 模拟轨迹 / 天气面板
// 功能：
// 1. 拦截原来的 /api/route，让路线规划调用高德真实道路路线
// 2. 模拟轨迹使用高德返回的真实路线坐标
// 3. 轨迹终点强制落在终点景点坐标上
// 4. 天气调用高德 AMap.Weather
// 5. 空气质量、人流量使用合理演示数据
// 6. 天气框默认隐藏，点击景点后显示，可手动关闭
// 请放在 main.js 最下面
// =====================================================
(function () {
    if (window.__amapStablePatchInstalled) {
        return;
    }

    window.__amapStablePatchInstalled = true;

    const oldFetch = window.fetch.bind(window);

    let currentWeatherFeature = null;
    let weatherPanelClosed = true;

    function makeJsonResponse(data) {
        return Promise.resolve(
            new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            })
        );
    }

    function getUrlParam(urlText, key) {
        try {
            const query = urlText.split('?')[1] || '';
            const params = new URLSearchParams(query);
            return params.get(key) || '';
        } catch (e) {
            return '';
        }
    }

    function getFeatureName(feature) {
        if (!feature) return '';

        return (
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            feature.get('id') ||
            ''
        );
    }

    function getFeatureProvince(feature) {
        if (!feature) return '';

        if (typeof getAttractionProvince === 'function') {
            const province = getAttractionProvince(feature);
            if (province && province !== '其他省份') return province;
        }

        return feature.get('province') || feature.get('省份') || '';
    }

    function getFeatureCity(feature) {
        if (!feature) return '';

        if (typeof getAttractionCity === 'function') {
            const city = getAttractionCity(feature);
            if (city && city !== '其他城市') return city;
        }

        return feature.get('city') || feature.get('城市') || '';
    }

    function parseCoordinateText(text) {
        if (!text) return null;

        text = decodeURIComponent(String(text)).trim();

        try {
            const jsonValue = JSON.parse(text);

            if (
                Array.isArray(jsonValue) &&
                jsonValue.length >= 2 &&
                !isNaN(Number(jsonValue[0])) &&
                !isNaN(Number(jsonValue[1]))
            ) {
                return [Number(jsonValue[0]), Number(jsonValue[1])];
            }
        } catch (e) {}

        const match = text.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);

        if (match) {
            const lon = Number(match[1]);
            const lat = Number(match[3]);

            if (!isNaN(lon) && !isNaN(lat)) {
                return [lon, lat];
            }
        }

        return null;
    }

    function findAttractionCoordinateByName(nameText) {
        if (!nameText || typeof attractionsSource === 'undefined' || !attractionsSource) {
            return null;
        }

        const keyword = decodeURIComponent(String(nameText)).trim();

        if (!keyword) return null;

        const features = attractionsSource.getFeatures();

        let foundFeature = features.find(function (feature) {
            return getFeatureName(feature) === keyword;
        });

        if (!foundFeature) {
            foundFeature = features.find(function (feature) {
                const name = getFeatureName(feature);
                return name && (name.includes(keyword) || keyword.includes(name));
            });
        }

        if (foundFeature && foundFeature.getGeometry()) {
            const coord = foundFeature.getGeometry().getCoordinates();
            return [Number(coord[0]), Number(coord[1])];
        }

        return null;
    }

    function resolveRoutePoint(text) {
        return parseCoordinateText(text) || findAttractionCoordinateByName(text);
    }

    function parseWaypoints(urlText) {
        const waypointText =
            getUrlParam(urlText, 'waypoints') ||
            getUrlParam(urlText, 'waypoint') ||
            getUrlParam(urlText, 'via') ||
            '';

        if (!waypointText) return [];

        return decodeURIComponent(waypointText)
            .split(/[;|]/)
            .map(function (item) {
                return resolveRoutePoint(item);
            })
            .filter(function (coord) {
                return coord && coord.length >= 2;
            });
    }

    function coordsToPolyline(coords) {
        return coords.map(function (coord) {
            return coord[0] + ',' + coord[1];
        }).join(';');
    }

    function getLngLatFromAmapPoint(point) {
        if (!point) return null;

        if (typeof point.getLng === 'function' && typeof point.getLat === 'function') {
            return [
                Number(point.getLng().toFixed(6)),
                Number(point.getLat().toFixed(6))
            ];
        }

        if (point.lng !== undefined && point.lat !== undefined) {
            return [
                Number(Number(point.lng).toFixed(6)),
                Number(Number(point.lat).toFixed(6))
            ];
        }

        return null;
    }

    function calculateDistanceMeters(coord1, coord2) {
        if (
            typeof ol !== 'undefined' &&
            ol.sphere &&
            typeof ol.sphere.getDistance === 'function'
        ) {
            return ol.sphere.getDistance(coord1, coord2);
        }

        const dx = coord1[0] - coord2[0];
        const dy = coord1[1] - coord2[1];

        return Math.sqrt(dx * dx + dy * dy) * 111000;
    }

    function densifyCoords(coords, maxTotalPoints) {
        if (!coords || coords.length < 2) return coords || [];

        maxTotalPoints = maxTotalPoints || 900;

        let result = [];

        for (let i = 0; i < coords.length - 1; i++) {
            const start = coords[i];
            const end = coords[i + 1];

            const distance = calculateDistanceMeters(start, end);

            let count = Math.max(2, Math.ceil(distance / 800));
            count = Math.min(count, 10);

            for (let j = 0; j < count; j++) {
                const t = j / count;

                result.push([
                    Number((start[0] + (end[0] - start[0]) * t).toFixed(6)),
                    Number((start[1] + (end[1] - start[1]) * t).toFixed(6))
                ]);
            }
        }

        result.push(coords[coords.length - 1]);

        if (result.length > maxTotalPoints) {
            const step = Math.ceil(result.length / maxTotalPoints);
            const sampled = [];

            for (let i = 0; i < result.length; i += step) {
                sampled.push(result[i]);
            }

            sampled.push(result[result.length - 1]);
            result = sampled;
        }

        return result;
    }

    function createFallbackRoute(start, end, waypoints) {
        const points = [start].concat(waypoints || []).concat([end]);

        let coords = [];

        for (let i = 0; i < points.length - 1; i++) {
            const part = [];

            for (let j = 0; j <= 40; j++) {
                const t = j / 40;

                part.push([
                    Number((points[i][0] + (points[i + 1][0] - points[i][0]) * t).toFixed(6)),
                    Number((points[i][1] + (points[i + 1][1] - points[i][1]) * t).toFixed(6))
                ]);
            }

            if (i > 0) part.shift();
            coords = coords.concat(part);
        }

        coords[0] = [
            Number(start[0].toFixed(6)),
            Number(start[1].toFixed(6))
        ];

        coords[coords.length - 1] = [
            Number(end[0].toFixed(6)),
            Number(end[1].toFixed(6))
        ];

        let totalDistance = 0;

        for (let i = 0; i < points.length - 1; i++) {
            totalDistance += calculateDistanceMeters(points[i], points[i + 1]);
        }

        return {
            status: '1',
            info: '高德路线失败，使用兜底路线',
            route: {
                paths: [
                    {
                        distance: String(Math.round(totalDistance)),
                        duration: String(Math.round(Math.max(1200, totalDistance / 4))),
                        steps: [
                            {
                                road: '静态兜底路线',
                                polyline: coordsToPolyline(coords)
                            }
                        ]
                    }
                ]
            }
        };
    }

    function requestAmapDrivingRoute(start, end, waypoints) {
        return new Promise(function (resolve) {
            if (!window.AMap || !AMap.Driving) {
                console.warn('高德 AMap.Driving 没有加载成功，使用兜底路线。');
                resolve(createFallbackRoute(start, end, waypoints));
                return;
            }

            AMap.plugin('AMap.Driving', function () {
                const driving = new AMap.Driving({
                    policy: AMap.DrivingPolicy.LEAST_TIME
                });

                const origin = new AMap.LngLat(start[0], start[1]);
                const destination = new AMap.LngLat(end[0], end[1]);

                const options = {};

                if (waypoints && waypoints.length > 0) {
                    options.waypoints = waypoints.map(function (coord) {
                        return new AMap.LngLat(coord[0], coord[1]);
                    });
                }

                driving.search(origin, destination, options, function (status, result) {
                    if (
                        status !== 'complete' ||
                        !result ||
                        !result.routes ||
                        result.routes.length === 0
                    ) {
                        console.warn('高德路线规划失败，使用兜底路线：', status, result);
                        resolve(createFallbackRoute(start, end, waypoints));
                        return;
                    }

                    const route = result.routes[0];
                    let coords = [];

                    route.steps.forEach(function (step) {
                        if (!step.path) return;

                        step.path.forEach(function (point) {
                            const coord = getLngLatFromAmapPoint(point);

                            if (coord) coords.push(coord);
                        });
                    });

                    if (coords.length < 2) {
                        resolve(createFallbackRoute(start, end, waypoints));
                        return;
                    }

                    coords[0] = [
                        Number(start[0].toFixed(6)),
                        Number(start[1].toFixed(6))
                    ];

                    coords[coords.length - 1] = [
                        Number(end[0].toFixed(6)),
                        Number(end[1].toFixed(6))
                    ];

                    coords = densifyCoords(coords, 900);

                    coords[coords.length - 1] = [
                        Number(end[0].toFixed(6)),
                        Number(end[1].toFixed(6))
                    ];

                    resolve({
                        status: '1',
                        info: '高德真实道路路线',
                        route: {
                            paths: [
                                {
                                    distance: String(route.distance || 0),
                                    duration: String(route.time || 0),
                                    steps: [
                                        {
                                            road: '高德真实道路路线',
                                            polyline: coordsToPolyline(coords)
                                        }
                                    ]
                                }
                            ]
                        }
                    });
                });
            });
        });
    }

    function createAmapRouteResponse(urlText) {
        const originText =
            getUrlParam(urlText, 'origin') ||
            getUrlParam(urlText, 'start') ||
            getUrlParam(urlText, 'from') ||
            '';

        const destinationText =
            getUrlParam(urlText, 'destination') ||
            getUrlParam(urlText, 'end') ||
            getUrlParam(urlText, 'to') ||
            '';

        const start = resolveRoutePoint(originText);
        const end = resolveRoutePoint(destinationText);
        const waypoints = parseWaypoints(urlText);

        if (!start || !end) {
            return Promise.resolve({
                status: '0',
                info: '路线起点或终点解析失败，请重新选择景点'
            });
        }

        return requestAmapDrivingRoute(start, end, waypoints);
    }

    function inferCityByName(name, province, city) {
        name = String(name || '');

        if (city && city !== '其他城市') {
            return city.endsWith('市') || city.includes('自治州') ? city : city + '市';
        }

        if (name.includes('故宫') || name.includes('天坛') || name.includes('颐和园') || name.includes('八达岭')) return '北京市';
        if (name.includes('西湖') || name.includes('灵隐') || name.includes('宋城')) return '杭州市';
        if (name.includes('黄山') || name.includes('宏村') || name.includes('西递')) return '黄山市';
        if (name.includes('桂林') || name.includes('漓江') || name.includes('阳朔')) return '桂林市';
        if (name.includes('丽江') || name.includes('玉龙') || name.includes('束河')) return '丽江市';
        if (name.includes('大理') || name.includes('崇圣寺')) return '大理市';
        if (name.includes('鼓浪屿') || name.includes('厦门')) return '厦门市';
        if (name.includes('武夷山')) return '南平市';
        if (name.includes('九寨沟') || name.includes('黄龙')) return '阿坝藏族羌族自治州';
        if (name.includes('都江堰') || name.includes('峨眉山')) return '成都市';
        if (name.includes('兵马俑') || name.includes('大雁塔') || name.includes('华清宫') || name.includes('西安')) return '西安市';
        if (name.includes('华山')) return '渭南市';
        if (name.includes('苏州') || name.includes('拙政园') || name.includes('虎丘')) return '苏州市';
        if (name.includes('广州') || name.includes('陈家祠')) return '广州市';
        if (name.includes('布达拉宫')) return '拉萨市';
        if (name.includes('承德')) return '承德市';
        if (name.includes('凤凰古城')) return '湘西土家族苗族自治州';
        if (name.includes('张家界')) return '张家界市';
        if (name.includes('龙门石窟')) return '洛阳市';
        if (name.includes('平遥')) return '晋中市';
        if (name.includes('曲阜')) return '济宁市';

        if (province && province !== '其他省份') return province;

        return '北京市';
    }

    function getWeatherPanel() {
        let panel = document.getElementById('weatherPanel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'weatherPanel';
            document.body.appendChild(panel);
        }

        return panel;
    }

    function hideWeatherPanel() {
        const panel = getWeatherPanel();
        panel.style.display = 'none';
    }

    window.closeStaticWeatherPanel = function () {
        weatherPanelClosed = true;
        currentWeatherFeature = null;
        hideWeatherPanel();
    };

    function hashText(text) {
        text = String(text || '');
        let hash = 0;

        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }

        return Math.abs(hash);
    }

    function randomByKey(key, min, max) {
        const seed = hashText(key);
        const x = Math.sin(seed) * 10000;
        const ratio = x - Math.floor(x);
        return Math.round(min + ratio * (max - min));
    }

    function getAirAndCrowdData(feature, cityName) {
        const name = getFeatureName(feature);

        const aqiBase = randomByKey(cityName + '_aqi', 42, 88);
        const aqi = aqiBase + randomByKey(name + '_aqi_offset', -4, 4);

        let airLevel = '良';
        let airColor = '#f1c40f';
        let airAdvice = '空气质量良好，适合正常游览。';

        if (aqi <= 50) {
            airLevel = '优';
            airColor = '#2ecc71';
            airAdvice = '空气质量优秀，非常适合户外游览。';
        } else if (aqi <= 100) {
            airLevel = '良';
            airColor = '#f1c40f';
            airAdvice = '空气质量良好，适合正常游览。';
        } else {
            airLevel = '轻度污染';
            airColor = '#e67e22';
            airAdvice = '空气质量一般，建议适当减少长时间户外活动。';
        }

        const crowd = randomByKey(name + '_crowd', 25, 92);

        let crowdLevel = '舒适';
        let crowdColor = '#2ecc71';
        let crowdAdvice = '当前人流量较少，适合游览。';

        if (crowd < 40) {
            crowdLevel = '舒适';
            crowdColor = '#2ecc71';
            crowdAdvice = '当前人流量较少，适合游览。';
        } else if (crowd < 65) {
            crowdLevel = '适中';
            crowdColor = '#f1c40f';
            crowdAdvice = '当前人流量适中，游览体验较好。';
        } else if (crowd < 82) {
            crowdLevel = '拥挤';
            crowdColor = '#e67e22';
            crowdAdvice = '游客较多，建议错峰游览。';
        } else {
            crowdLevel = '爆满';
            crowdColor = '#e74c3c';
            crowdAdvice = '当前人流量较大，建议更换游览时间。';
        }

        return {
            aqi: aqi,
            pm25: Math.max(10, Math.round(aqi * 0.45)),
            pm10: Math.max(20, Math.round(aqi * 0.78)),
            airLevel: airLevel,
            airColor: airColor,
            airAdvice: airAdvice,
            crowd: crowd,
            crowdLevel: crowdLevel,
            crowdColor: crowdColor,
            crowdAdvice: crowdAdvice
        };
    }

    function renderWeatherPanel(feature, liveWeather) {
        const name = getFeatureName(feature);
        const province = getFeatureProvince(feature);
        const city = inferCityByName(name, province, getFeatureCity(feature));
        const extra = getAirAndCrowdData(feature, city);

        const weatherText = liveWeather.weather || '多云';
        const temp = liveWeather.temperature || '--';
        const humidity = liveWeather.humidity || '--';
        const windDirection = liveWeather.windDirection || '东南';
        const windPower = liveWeather.windPower || '2';

        let icon = '⛅';

        if (weatherText.includes('晴')) icon = '☀️';
        if (weatherText.includes('阴')) icon = '🌥️';
        if (weatherText.includes('雨')) icon = '🌧️';
        if (weatherText.includes('雪')) icon = '❄️';

        const panel = getWeatherPanel();

        panel.style.display = 'block';
        panel.style.position = 'absolute';
        panel.style.left = '315px';
        panel.style.top = '185px';
        panel.style.zIndex = '9999';
        panel.style.width = '230px';
        panel.style.background = 'linear-gradient(135deg, #5b6ee1, #7d4ac7)';
        panel.style.borderRadius = '8px';
        panel.style.boxShadow = '0 4px 14px rgba(0,0,0,0.28)';
        panel.style.color = '#fff';
        panel.style.fontSize = '12px';
        panel.style.overflow = 'hidden';

        panel.innerHTML = `
            <div style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.25); position: relative;">
                <button type="button" onclick="closeStaticWeatherPanel()" style="position:absolute;right:6px;top:5px;border:none;background:rgba(255,255,255,0.18);color:#fff;border-radius:50%;width:22px;height:22px;line-height:20px;font-size:16px;cursor:pointer;" title="关闭">×</button>

                <div style="display:flex;align-items:center;justify-content:space-between;padding-right:26px;">
                    <div style="font-size:20px;">${icon}</div>
                    <div style="text-align:right;">
                        <div style="font-size:17px;font-weight:bold;">${temp}℃</div>
                        <div style="font-size:11px;">${weatherText}</div>
                    </div>
                </div>

                <div style="margin-top:4px;font-size:11px;opacity:0.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${city} · ${name}
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.2);">
                <div>
                    <div>💧</div>
                    <div>${humidity}%</div>
                </div>
                <div>
                    <div>🌫️</div>
                    <div>AQI ${extra.aqi}</div>
                </div>
                <div>
                    <div>👥</div>
                    <div>${extra.crowd}%</div>
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.94);color:#333;padding:8px 10px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span>风向风力</span>
                    <span>${windDirection}风 ${windPower}级</span>
                </div>

                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span>空气质量</span>
                    <span style="color:${extra.airColor};font-weight:bold;">${extra.airLevel}</span>
                </div>

                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span>人流量</span>
                    <span style="color:${extra.crowdColor};font-weight:bold;">${extra.crowdLevel}</span>
                </div>

                <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;color:#666;">
                    <span>PM2.5：${extra.pm25}</span>
                    <span>PM10：${extra.pm10}</span>
                </div>

                <div style="font-size:11px;color:#555;line-height:1.5;">
                    ${extra.airAdvice}<br>
                    ${extra.crowdAdvice}
                </div>
            </div>
        `;
    }

    function queryAmapWeather(feature) {
        if (!feature) return;

        const name = getFeatureName(feature);
        const province = getFeatureProvince(feature);
        const city = inferCityByName(name, province, getFeatureCity(feature));

        currentWeatherFeature = feature;
        weatherPanelClosed = false;

        if (!window.AMap || !AMap.Weather) {
            console.warn('高德 AMap.Weather 未加载，使用兜底天气。');

            renderWeatherPanel(feature, {
                weather: '多云',
                temperature: 28,
                humidity: 60,
                windDirection: '东南',
                windPower: '2'
            });

            return;
        }

        AMap.plugin('AMap.Weather', function () {
            const weather = new AMap.Weather();

            weather.getLive(city, function (err, data) {
                if (weatherPanelClosed) return;

                if (err || !data) {
                    console.warn('高德天气查询失败，使用兜底天气：', err);

                    renderWeatherPanel(feature, {
                        weather: '多云',
                        temperature: 28,
                        humidity: 60,
                        windDirection: '东南',
                        windPower: '2'
                    });

                    return;
                }

                renderWeatherPanel(feature, data);
            });
        });
    }

    function isAttractionFeature(feature) {
        if (!feature || !feature.getGeometry()) return false;

        const name = getFeatureName(feature);
        if (!name) return false;

        const type = feature.get('type') || feature.get('drawType') || '';

        if (
            type === 'box_select' ||
            type === 'circle_select' ||
            type === 'polygon_select' ||
            type === 'spatial_query' ||
            type === 'route' ||
            type === 'track' ||
            type === 'draw'
        ) {
            return false;
        }

        return true;
    }

    function bindAmapWeatherClick() {
        if (typeof map === 'undefined' || !map || window.__amapWeatherStableClickBound) {
            return;
        }

        window.__amapWeatherStableClickBound = true;

        map.on('singleclick', function (evt) {
            let clickedFeature = null;

            map.forEachFeatureAtPixel(evt.pixel, function (feature) {
                if (isAttractionFeature(feature)) {
                    clickedFeature = feature;
                    return true;
                }

                return false;
            });

            if (clickedFeature) {
                setTimeout(function () {
                    queryAmapWeather(clickedFeature);
                }, 200);
            }
        });
    }

    // 覆盖旧天气函数，防止旧代码自己弹出天气框
    window.loadWeather = function () { return Promise.resolve(null); };
    window.loadWeatherData = function () { return Promise.resolve(null); };
    window.queryWeather = function () { return Promise.resolve(null); };
    window.queryAirQuality = function () { return Promise.resolve(null); };
    window.loadAirQualityData = function () { return Promise.resolve(null); };
    window.startRealTimeUpdate = function () { return null; };
    window.stopRealTimeUpdate = function () { return null; };

    // 拦截原来的后端路线接口，让 GitHub Pages 可以使用高德真实路线
    window.fetch = function (input, init) {
        const urlText = typeof input === 'string'
            ? input
            : input && input.url
                ? input.url
                : '';

        const lowerUrl = urlText.toLowerCase();

        if (lowerUrl.includes('api/route')) {
            return createAmapRouteResponse(urlText).then(function (data) {
                return makeJsonResponse(data);
            });
        }

        return oldFetch(input, init);
    };

    // 尝试降低轨迹播放速度
    window.trackPlaybackSpeed = 0.45;
    window.trackSpeed = 0.45;
    window.routeAnimationSpeed = 0.45;

    // 默认隐藏天气框
    hideWeatherPanel();

    setTimeout(hideWeatherPanel, 500);
    setTimeout(hideWeatherPanel, 1500);
    setTimeout(hideWeatherPanel, 3000);

    //setTimeout(bindAmapWeatherClick, 1000);
    //setTimeout(bindAmapWeatherClick, 2500);
    //setTimeout(bindAmapWeatherClick, 4000);

    //setInterval(function () {
        //if (!currentWeatherFeature || weatherPanelClosed) {
            //hideWeatherPanel();
        //}
    //}, 800);
})();

// =====================================================
// 路线规划弹窗：隐藏“路线方案”选择框
// 默认只使用推荐路线（最佳）
// 请放在 main.js 最下面
// =====================================================
(function () {
    if (window.__hideRouteStrategyInstalled) {
        return;
    }

    window.__hideRouteStrategyInstalled = true;

    function getTextAroundSelect(select) {
        const texts = [];

        if (select.id) {
            const label = document.querySelector('label[for="' + select.id + '"]');
            if (label) {
                texts.push(label.innerText || label.textContent || '');
            }
        }

        if (select.previousElementSibling) {
            texts.push(select.previousElementSibling.innerText || select.previousElementSibling.textContent || '');
        }

        if (select.parentElement) {
            texts.push(select.parentElement.innerText || select.parentElement.textContent || '');
        }

        return texts.join(' ');
    }

    function isRouteStrategySelect(select) {
        if (!select) {
            return false;
        }

        const idNameClass = [
            select.id || '',
            select.name || '',
            select.className || ''
        ].join(' ').toLowerCase();

        const aroundText = getTextAroundSelect(select);

        const optionText = Array.from(select.options || []).map(function (option) {
            return option.textContent || '';
        }).join(' ');

        // 起点、终点、途经点不能隐藏
        if (
            aroundText.includes('起点') ||
            aroundText.includes('终点') ||
            aroundText.includes('目的地') ||
            aroundText.includes('途经')
        ) {
            return false;
        }

        // 判断是不是路线方案
        if (
            aroundText.includes('路线方案') ||
            aroundText.includes('路线策略') ||
            aroundText.includes('规划方案') ||
            idNameClass.includes('strategy') ||
            idNameClass.includes('policy') ||
            idNameClass.includes('scheme') ||
            optionText.includes('时间最短') ||
            optionText.includes('距离最短') ||
            optionText.includes('花费最少') ||
            optionText.includes('最短时间') ||
            optionText.includes('最短距离')
        ) {
            return true;
        }

        return false;
    }

    function hideRouteStrategySelect() {
        const routeModal = document.getElementById('routeModal');

        if (!routeModal) {
            return;
        }

        const selects = routeModal.querySelectorAll('select');

        selects.forEach(function (select) {
            if (!isRouteStrategySelect(select) && select.dataset.routeStrategySelect !== 'true') {
                return;
            }

            // 标记它是路线方案
            select.dataset.routeStrategySelect = 'true';

            // 强制变成一个默认值：推荐路线
            select.innerHTML = `
                <option value="best" selected>推荐路线（最佳）</option>
            `;
            select.value = 'best';

            // 隐藏它所在的一整行
            const container =
                select.closest('.mb-3') ||
                select.closest('.form-group') ||
                select.closest('.row') ||
                select.parentElement;

            if (container) {
                container.style.display = 'none';
            } else {
                select.style.display = 'none';
            }
        });
    }

    // 如果旧函数刷新下拉框，防止它把路线方案重新改成景点列表
    const oldForceRefreshRoutePlanningDropdowns = window.forceRefreshRoutePlanningDropdowns;

    window.forceRefreshRoutePlanningDropdowns = function () {
        if (typeof oldForceRefreshRoutePlanningDropdowns === 'function') {
            oldForceRefreshRoutePlanningDropdowns();
        }

        hideRouteStrategySelect();
    };

    // 打开路线规划窗口时自动隐藏
    function bindRouteModalHideStrategy() {
        const routeModal = document.getElementById('routeModal');

        if (!routeModal || routeModal.dataset.hideStrategyBound) {
            return;
        }

        routeModal.addEventListener('show.bs.modal', function () {
            setTimeout(hideRouteStrategySelect, 50);
            setTimeout(hideRouteStrategySelect, 300);
            setTimeout(hideRouteStrategySelect, 800);
        });

        routeModal.addEventListener('shown.bs.modal', function () {
            setTimeout(hideRouteStrategySelect, 50);
            setTimeout(hideRouteStrategySelect, 300);
            setTimeout(hideRouteStrategySelect, 800);
        });

        routeModal.dataset.hideStrategyBound = 'true';
    }

    setTimeout(bindRouteModalHideStrategy, 500);
    setTimeout(bindRouteModalHideStrategy, 1500);
    setTimeout(bindRouteModalHideStrategy, 3000);

    setTimeout(hideRouteStrategySelect, 500);
    setTimeout(hideRouteStrategySelect, 1500);
    setTimeout(hideRouteStrategySelect, 3000);
    setTimeout(hideRouteStrategySelect, 5000);

    // 防止旧代码后续又把它显示出来
    setInterval(hideRouteStrategySelect, 1000);
})();

// =====================================================
// 高德路线拥堵情况增强版
// 作用：给路线规划结果增加“实时路况 / 拥堵情况”信息
// 请放在 main.js 最下面
// =====================================================
(function () {
    if (window.__amapTrafficSummaryPatchInstalled) {
        return;
    }

    window.__amapTrafficSummaryPatchInstalled = true;

    function parsePolylineToCoords(polyline) {
        if (!polyline) {
            return [];
        }

        return String(polyline).split(';').map(function (item) {
            const parts = item.split(',');
            return [Number(parts[0]), Number(parts[1])];
        }).filter(function (coord) {
            return !isNaN(coord[0]) && !isNaN(coord[1]);
        });
    }

    function getTrafficStatusFromSpeed(speedKmh) {
        if (speedKmh >= 45) {
            return {
                statusText: '畅通',
                statusClass: 'smooth',
                color: '#00c853',
                congestionIndex: 15
            };
        }

        if (speedKmh >= 28) {
            return {
                statusText: '缓行',
                statusClass: 'slow',
                color: '#ffd600',
                congestionIndex: 45
            };
        }

        if (speedKmh >= 15) {
            return {
                statusText: '拥堵',
                statusClass: 'jam',
                color: '#ff6d00',
                congestionIndex: 70
            };
        }

        return {
            statusText: '严重拥堵',
            statusClass: 'heavy-jam',
            color: '#d50000',
            congestionIndex: 90
        };
    }

    function buildTrafficSummaryFromPath(path) {
        if (!path) {
            return null;
        }

        const distance = Number(path.distance || 0);
        const duration = Number(path.duration || 0);

        let speedKmh = 0;

        if (distance > 0 && duration > 0) {
            speedKmh = distance / duration * 3.6;
        }

        // 如果高德返回的时长/距离异常，就给一个默认速度
        if (!speedKmh || !isFinite(speedKmh)) {
            speedKmh = 35;
        }

        const traffic = getTrafficStatusFromSpeed(speedKmh);

        return {
            statusText: traffic.statusText,
            statusClass: traffic.statusClass,
            color: traffic.color,
            averageSpeed: Math.round(speedKmh),
            congestionIndex: traffic.congestionIndex,
            distance: distance,
            duration: duration
        };
    }

    function addTrafficSummaryToRouteData(routeData) {
        if (
            !routeData ||
            !routeData.route ||
            !routeData.route.paths ||
            !routeData.route.paths.length
        ) {
            return routeData;
        }

        routeData.route.paths.forEach(function (path) {
            path.trafficSummary = buildTrafficSummaryFromPath(path);

            // 如果以后高德返回了更细的路况字段，可以在这里继续解析
            // 常见字段可能在 step.tmcs / step.traffic_status / step.tmcs.status 中
            if (path.steps && path.steps.length) {
                const allTrafficSegments = [];

                path.steps.forEach(function (step) {
                    if (Array.isArray(step.tmcs)) {
                        step.tmcs.forEach(function (tmc) {
                            allTrafficSegments.push(tmc);
                        });
                    }

                    if (step.traffic_status) {
                        allTrafficSegments.push({
                            status: step.traffic_status,
                            polyline: step.polyline || ''
                        });
                    }
                });

                path.trafficSegments = allTrafficSegments;
            }
        });

        return routeData;
    }

    const oldFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
        const urlText = typeof input === 'string'
            ? input
            : input && input.url
                ? input.url
                : '';

        const lowerUrl = urlText.toLowerCase();

        if (lowerUrl.includes('api/route')) {
            return oldFetch(input, init).then(function (response) {
                return response.json().then(function (data) {
                    const newData = addTrafficSummaryToRouteData(data);

                    return new Response(JSON.stringify(newData), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    });
                });
            });
        }

        return oldFetch(input, init);
    };

    window.getRouteTrafficText = function (trafficSummary) {
        if (!trafficSummary) {
            return '路况未知';
        }

        return trafficSummary.statusText +
            '，平均速度约 ' +
            trafficSummary.averageSpeed +
            ' km/h，拥堵指数 ' +
            trafficSummary.congestionIndex +
            '%';
    };
})();

// =====================================================
// 路线规划结果面板：自动补充实时路况文字
// =====================================================
(function () {
    if (window.__routeTrafficPanelAutoTextInstalled) {
        return;
    }

    window.__routeTrafficPanelAutoTextInstalled = true;

    window.lastRouteTrafficSummary = null;

    const oldFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
        const urlText = typeof input === 'string'
            ? input
            : input && input.url
                ? input.url
                : '';

        const lowerUrl = urlText.toLowerCase();

        if (lowerUrl.includes('api/route')) {
            return oldFetch(input, init).then(function (response) {
                return response.clone().json().then(function (data) {
                    try {
                        const path = data.route && data.route.paths && data.route.paths[0];

                        if (path) {
                            window.lastRouteTrafficSummary = path.trafficSummary || null;

                            setTimeout(function () {
                                insertTrafficInfoToRouteModal(window.lastRouteTrafficSummary);
                            }, 500);

                            setTimeout(function () {
                                insertTrafficInfoToRouteModal(window.lastRouteTrafficSummary);
                            }, 1200);
                        }
                    } catch (e) {
                        console.warn('自动插入路况信息失败：', e);
                    }

                    return response;
                });
            });
        }

        return oldFetch(input, init);
    };

    window.insertTrafficInfoToRouteModal = function (trafficSummary) {
        const routeModal = document.getElementById('routeModal');

        if (!routeModal || !trafficSummary) {
            return;
        }

        let infoBox =
            routeModal.querySelector('.route-result') ||
            routeModal.querySelector('.route-info') ||
            routeModal.querySelector('.alert-info') ||
            routeModal.querySelector('.alert');

        if (!infoBox) {
            return;
        }

        let trafficRow = routeModal.querySelector('#routeTrafficSummaryRow');

        if (!trafficRow) {
            trafficRow = document.createElement('div');
            trafficRow.id = 'routeTrafficSummaryRow';
            trafficRow.style.display = 'flex';
            trafficRow.style.justifyContent = 'space-between';
            trafficRow.style.alignItems = 'center';
            trafficRow.style.padding = '7px 12px';
            trafficRow.style.marginTop = '6px';
            trafficRow.style.background = '#fff';
            trafficRow.style.border = '1px solid #eee';
            trafficRow.style.borderRadius = '6px';
            infoBox.appendChild(trafficRow);
        }

        trafficRow.innerHTML = `
            <span>实时路况</span>
            <span style="font-weight:bold;color:${trafficSummary.color};">
                ${trafficSummary.statusText}
                · ${trafficSummary.averageSpeed} km/h
                · 拥堵指数 ${trafficSummary.congestionIndex}%
            </span>
        `;
    };
})();

// =====================================================
// 高德路线分段路况版：真实路线 + 分段颜色 + 路口步骤
// 功能：
// 1. 调用 AMap.Driving 获取真实道路路线
// 2. 尽量读取高德返回的路况字段
// 3. 没有精细路况时，按道路类型/路段速度合理推断
// 4. OpenLayers 中按路段分色显示：绿/黄/橙/红
// 5. 路线规划弹窗中显示路口/转向步骤
// 请放在 main.js 最下面
// =====================================================
(function () {
    if (window.__amapTrafficSegmentRouteInstalled) {
        return;
    }

    window.__amapTrafficSegmentRouteInstalled = true;

    const oldFetch = window.fetch.bind(window);

    let trafficRouteSource = null;
    let trafficRouteLayer = null;
    let trafficStepSource = null;
    let trafficStepLayer = null;

    function makeJsonResponse(data) {
        return Promise.resolve(
            new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            })
        );
    }

    function getUrlParam(urlText, key) {
        try {
            const query = urlText.split('?')[1] || '';
            const params = new URLSearchParams(query);
            return params.get(key) || '';
        } catch (e) {
            return '';
        }
    }

    function getFeatureName(feature) {
        if (!feature) {
            return '';
        }

        return (
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            feature.get('id') ||
            ''
        );
    }

    function parseCoordinateText(text) {
        if (!text) {
            return null;
        }

        text = decodeURIComponent(String(text)).trim();

        try {
            const jsonValue = JSON.parse(text);

            if (
                Array.isArray(jsonValue) &&
                jsonValue.length >= 2 &&
                !isNaN(Number(jsonValue[0])) &&
                !isNaN(Number(jsonValue[1]))
            ) {
                return [Number(jsonValue[0]), Number(jsonValue[1])];
            }
        } catch (e) {}

        const match = text.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);

        if (match) {
            const lon = Number(match[1]);
            const lat = Number(match[3]);

            if (!isNaN(lon) && !isNaN(lat)) {
                return [lon, lat];
            }
        }

        return null;
    }

    function findAttractionCoordinateByName(nameText) {
        if (!nameText || typeof attractionsSource === 'undefined' || !attractionsSource) {
            return null;
        }

        const keyword = decodeURIComponent(String(nameText)).trim();

        if (!keyword) {
            return null;
        }

        const features = attractionsSource.getFeatures();

        let foundFeature = features.find(function (feature) {
            return getFeatureName(feature) === keyword;
        });

        if (!foundFeature) {
            foundFeature = features.find(function (feature) {
                const name = getFeatureName(feature);
                return name && (name.includes(keyword) || keyword.includes(name));
            });
        }

        if (foundFeature && foundFeature.getGeometry()) {
            const coord = foundFeature.getGeometry().getCoordinates();
            return [Number(coord[0]), Number(coord[1])];
        }

        return null;
    }

    function resolveRoutePoint(text) {
        return parseCoordinateText(text) || findAttractionCoordinateByName(text);
    }

    function parseWaypoints(urlText) {
        const waypointText =
            getUrlParam(urlText, 'waypoints') ||
            getUrlParam(urlText, 'waypoint') ||
            getUrlParam(urlText, 'via') ||
            '';

        if (!waypointText) {
            return [];
        }

        return decodeURIComponent(waypointText)
            .split(/[;|]/)
            .map(function (item) {
                return resolveRoutePoint(item);
            })
            .filter(function (coord) {
                return coord && coord.length >= 2;
            });
    }

    function getLngLatFromAmapPoint(point) {
        if (!point) {
            return null;
        }

        if (typeof point.getLng === 'function' && typeof point.getLat === 'function') {
            return [
                Number(point.getLng().toFixed(6)),
                Number(point.getLat().toFixed(6))
            ];
        }

        if (point.lng !== undefined && point.lat !== undefined) {
            return [
                Number(Number(point.lng).toFixed(6)),
                Number(Number(point.lat).toFixed(6))
            ];
        }

        return null;
    }

    function coordsToPolyline(coords) {
        return coords.map(function (coord) {
            return coord[0] + ',' + coord[1];
        }).join(';');
    }

    function parsePolyline(polyline) {
        if (!polyline) {
            return [];
        }

        return String(polyline)
            .split(';')
            .map(function (item) {
                const parts = item.split(',');
                return [Number(parts[0]), Number(parts[1])];
            })
            .filter(function (coord) {
                return !isNaN(coord[0]) && !isNaN(coord[1]);
            });
    }

    function calculateDistanceMeters(coord1, coord2) {
        if (
            typeof ol !== 'undefined' &&
            ol.sphere &&
            typeof ol.sphere.getDistance === 'function'
        ) {
            return ol.sphere.getDistance(coord1, coord2);
        }

        const dx = coord1[0] - coord2[0];
        const dy = coord1[1] - coord2[1];

        return Math.sqrt(dx * dx + dy * dy) * 111000;
    }

    function getTrafficStyle(statusText) {
        if (!statusText) {
            statusText = '畅通';
        }

        statusText = String(statusText);

        if (statusText.includes('严重') || statusText.includes('重度')) {
            return {
                text: '严重拥堵',
                color: '#d50000',
                className: 'heavy-jam'
            };
        }

        if (statusText.includes('拥堵') || statusText.includes('堵')) {
            return {
                text: '拥堵',
                color: '#ff6d00',
                className: 'jam'
            };
        }

        if (statusText.includes('缓') || statusText.includes('慢')) {
            return {
                text: '缓行',
                color: '#ffd600',
                className: 'slow'
            };
        }

        return {
            text: '畅通',
            color: '#00c853',
            className: 'smooth'
        };
    }

    function inferTrafficStatus(step, index, totalSteps) {
        const road = step.road || step.name || '';
        const instruction = step.instruction || '';

        const distance = Number(step.distance || 0);
        const time = Number(step.time || step.duration || 0);

        let speedKmh = 35;

        if (distance > 0 && time > 0) {
            speedKmh = distance / time * 3.6;
        }

        // 高速、快速路一般更畅通
        if (
            road.includes('高速') ||
            road.includes('快速') ||
            road.includes('环线') ||
            road.includes('高架')
        ) {
            if (speedKmh >= 35) {
                return '畅通';
            }

            if (speedKmh >= 25) {
                return '缓行';
            }

            return '拥堵';
        }

        // 起步和到达附近更容易拥堵
        if (index <= 1 || index >= totalSteps - 2) {
            if (speedKmh >= 28) {
                return '缓行';
            }

            if (speedKmh >= 18) {
                return '拥堵';
            }

            return '严重拥堵';
        }

        // 有转向、路口、进入街道的地方更可能慢
        if (
            instruction.includes('左转') ||
            instruction.includes('右转') ||
            instruction.includes('掉头') ||
            instruction.includes('路口') ||
            instruction.includes('进入')
        ) {
            if (speedKmh >= 30) {
                return '缓行';
            }

            return '拥堵';
        }

        if (speedKmh >= 45) {
            return '畅通';
        }

        if (speedKmh >= 28) {
            return '缓行';
        }

        if (speedKmh >= 15) {
            return '拥堵';
        }

        return '严重拥堵';
    }

    function getStepCoords(step) {
        const coords = [];

        if (step.path && step.path.length) {
            step.path.forEach(function (point) {
                const coord = getLngLatFromAmapPoint(point);
                if (coord) {
                    coords.push(coord);
                }
            });
        }

        if (coords.length === 0 && step.polyline) {
            return parsePolyline(step.polyline);
        }

        return coords;
    }

    function extractTrafficSegmentsFromStep(step, stepIndex, totalSteps) {
        const segments = [];

        // 情况一：高德返回了 tmcs，优先使用真实分段路况
        if (Array.isArray(step.tmcs) && step.tmcs.length > 0) {
            step.tmcs.forEach(function (tmc) {
                const coords = parsePolyline(tmc.polyline || tmc.path || '');

                if (coords.length >= 2) {
                    const traffic = getTrafficStyle(tmc.status || tmc.statusText || tmc.traffic_status || '');

                    segments.push({
                        coords: coords,
                        trafficText: traffic.text,
                        trafficColor: traffic.color,
                        trafficClass: traffic.className,
                        road: tmc.road || step.road || '',
                        instruction: step.instruction || ''
                    });
                }
            });

            if (segments.length > 0) {
                return segments;
            }
        }

        // 情况二：没有 tmcs，就按 step 推断该路段路况
        const stepCoords = getStepCoords(step);

        if (stepCoords.length >= 2) {
            const statusText = step.traffic_status || step.trafficStatus || inferTrafficStatus(step, stepIndex, totalSteps);
            const traffic = getTrafficStyle(statusText);

            segments.push({
                coords: stepCoords,
                trafficText: traffic.text,
                trafficColor: traffic.color,
                trafficClass: traffic.className,
                road: step.road || '',
                instruction: step.instruction || ''
            });
        }

        return segments;
    }

    function buildRouteResponseFromAmap(start, end, waypoints, amapResult) {
        const route = amapResult.routes[0];
        const steps = route.steps || [];

        const allCoords = [];
        const trafficSegments = [];
        const instructionSteps = [];

        steps.forEach(function (step, index) {
            const stepCoords = getStepCoords(step);

            stepCoords.forEach(function (coord) {
                allCoords.push(coord);
            });

            const stepSegments = extractTrafficSegmentsFromStep(step, index, steps.length);

            stepSegments.forEach(function (segment) {
                trafficSegments.push(segment);
            });

            const startCoord = stepCoords[0] || null;
            const endCoord = stepCoords[stepCoords.length - 1] || null;

            instructionSteps.push({
                index: index + 1,
                instruction: step.instruction || step.road || '继续前行',
                road: step.road || '',
                action: step.action || '',
                assistantAction: step.assistant_action || step.assistantAction || '',
                distance: Number(step.distance || 0),
                duration: Number(step.time || step.duration || 0),
                startCoord: startCoord,
                endCoord: endCoord,
                trafficText: stepSegments[0] ? stepSegments[0].trafficText : '畅通',
                trafficColor: stepSegments[0] ? stepSegments[0].trafficColor : '#00c853'
            });
        });

        if (allCoords.length < 2) {
            return createFallbackRoute(start, end, waypoints);
        }

        allCoords[0] = [
            Number(start[0].toFixed(6)),
            Number(start[1].toFixed(6))
        ];

        allCoords[allCoords.length - 1] = [
            Number(end[0].toFixed(6)),
            Number(end[1].toFixed(6))
        ];

        if (trafficSegments.length > 0) {
            trafficSegments[0].coords[0] = [
                Number(start[0].toFixed(6)),
                Number(start[1].toFixed(6))
            ];

            trafficSegments[trafficSegments.length - 1].coords[
                trafficSegments[trafficSegments.length - 1].coords.length - 1
            ] = [
                Number(end[0].toFixed(6)),
                Number(end[1].toFixed(6))
            ];
        }

        const trafficSummary = buildTrafficSummary(trafficSegments, route.distance || 0, route.time || 0);

        const result = {
            status: '1',
            info: '高德真实道路路线：分段路况版',
            route: {
                paths: [
                    {
                        distance: String(route.distance || 0),
                        duration: String(route.time || 0),
                        trafficSummary: trafficSummary,
                        trafficSegments: trafficSegments,
                        instructionSteps: instructionSteps,
                        steps: [
                            {
                                road: '高德真实道路路线',
                                instruction: '高德真实道路路线',
                                polyline: coordsToPolyline(allCoords),
                                trafficSegments: trafficSegments,
                                instructionSteps: instructionSteps
                            }
                        ]
                    }
                ]
            }
        };

        return result;
    }

    function buildTrafficSummary(segments, distance, duration) {
        const countMap = {
            '畅通': 0,
            '缓行': 0,
            '拥堵': 0,
            '严重拥堵': 0
        };

        segments.forEach(function (segment) {
            if (countMap[segment.trafficText] !== undefined) {
                countMap[segment.trafficText]++;
            }
        });

        let mainStatus = '畅通';

        if (countMap['严重拥堵'] > 0) {
            mainStatus = '严重拥堵';
        } else if (countMap['拥堵'] > 0) {
            mainStatus = '拥堵';
        } else if (countMap['缓行'] > 0) {
            mainStatus = '缓行';
        }

        const style = getTrafficStyle(mainStatus);

        let speedKmh = 0;

        if (Number(distance) > 0 && Number(duration) > 0) {
            speedKmh = Number(distance) / Number(duration) * 3.6;
        }

        return {
            statusText: mainStatus,
            color: style.color,
            averageSpeed: Math.round(speedKmh || 35),
            segmentCount: segments.length,
            smoothCount: countMap['畅通'],
            slowCount: countMap['缓行'],
            jamCount: countMap['拥堵'],
            heavyJamCount: countMap['严重拥堵']
        };
    }

    function createFallbackRoute(start, end, waypoints) {
        const points = [start].concat(waypoints || []).concat([end]);

        let coords = [];

        for (let i = 0; i < points.length - 1; i++) {
            const part = [];

            for (let j = 0; j <= 40; j++) {
                const t = j / 40;

                part.push([
                    Number((points[i][0] + (points[i + 1][0] - points[i][0]) * t).toFixed(6)),
                    Number((points[i][1] + (points[i + 1][1] - points[i][1]) * t).toFixed(6))
                ]);
            }

            if (i > 0) {
                part.shift();
            }

            coords = coords.concat(part);
        }

        const segmentList = [];

        for (let i = 0; i < points.length - 1; i++) {
            const style = getTrafficStyle(i === 0 ? '缓行' : '畅通');

            segmentList.push({
                coords: [points[i], points[i + 1]],
                trafficText: style.text,
                trafficColor: style.color,
                trafficClass: style.className,
                road: '兜底路线',
                instruction: '继续前行'
            });
        }

        coords[0] = [
            Number(start[0].toFixed(6)),
            Number(start[1].toFixed(6))
        ];

        coords[coords.length - 1] = [
            Number(end[0].toFixed(6)),
            Number(end[1].toFixed(6))
        ];

        let totalDistance = 0;

        for (let i = 0; i < points.length - 1; i++) {
            totalDistance += calculateDistanceMeters(points[i], points[i + 1]);
        }

        return {
            status: '1',
            info: '高德路线失败，使用兜底路线',
            route: {
                paths: [
                    {
                        distance: String(Math.round(totalDistance)),
                        duration: String(Math.round(Math.max(1200, totalDistance / 4))),
                        trafficSummary: buildTrafficSummary(segmentList, totalDistance, Math.max(1200, totalDistance / 4)),
                        trafficSegments: segmentList,
                        instructionSteps: [],
                        steps: [
                            {
                                road: '静态兜底路线',
                                instruction: '静态兜底路线',
                                polyline: coordsToPolyline(coords),
                                trafficSegments: segmentList,
                                instructionSteps: []
                            }
                        ]
                    }
                ]
            }
        };
    }

    function requestAmapDrivingRouteWithTraffic(start, end, waypoints) {
        return new Promise(function (resolve) {
            if (!window.AMap || !AMap.Driving) {
                console.warn('高德 AMap.Driving 未加载，使用兜底路线。');
                resolve(createFallbackRoute(start, end, waypoints));
                return;
            }

            AMap.plugin('AMap.Driving', function () {
                const driving = new AMap.Driving({
                    policy: AMap.DrivingPolicy.LEAST_TIME,
                    showTraffic: true,
                    extensions: 'all'
                });

                const origin = new AMap.LngLat(start[0], start[1]);
                const destination = new AMap.LngLat(end[0], end[1]);

                const options = {};

                if (waypoints && waypoints.length > 0) {
                    options.waypoints = waypoints.map(function (coord) {
                        return new AMap.LngLat(coord[0], coord[1]);
                    });
                }

                driving.search(origin, destination, options, function (status, result) {
                    if (
                        status !== 'complete' ||
                        !result ||
                        !result.routes ||
                        result.routes.length === 0
                    ) {
                        console.warn('高德路线规划失败，使用兜底路线：', status, result);
                        resolve(createFallbackRoute(start, end, waypoints));
                        return;
                    }

                    const routeData = buildRouteResponseFromAmap(start, end, waypoints, result);
                    resolve(routeData);
                });
            });
        });
    }

    function createAmapTrafficRouteResponse(urlText) {
        const originText =
            getUrlParam(urlText, 'origin') ||
            getUrlParam(urlText, 'start') ||
            getUrlParam(urlText, 'from') ||
            '';

        const destinationText =
            getUrlParam(urlText, 'destination') ||
            getUrlParam(urlText, 'end') ||
            getUrlParam(urlText, 'to') ||
            '';

        const start = resolveRoutePoint(originText);
        const end = resolveRoutePoint(destinationText);
        const waypoints = parseWaypoints(urlText);

        if (!start || !end) {
            return Promise.resolve({
                status: '0',
                info: '路线起点或终点解析失败，请重新选择景点'
            });
        }

        return requestAmapDrivingRouteWithTraffic(start, end, waypoints);
    }

    function ensureTrafficRouteLayer() {
        if (trafficRouteLayer && trafficRouteSource) {
            return;
        }

        trafficRouteSource = new ol.source.Vector();

        trafficRouteLayer = new ol.layer.Vector({
            source: trafficRouteSource,
            zIndex: 2500,
            style: function (feature) {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: feature.get('trafficColor') || '#00c853',
                        width: 7
                    })
                });
            }
        });

        map.addLayer(trafficRouteLayer);

        trafficStepSource = new ol.source.Vector();

        trafficStepLayer = new ol.layer.Vector({
            source: trafficStepSource,
            zIndex: 2600,
            style: function (feature) {
                const index = feature.get('index') || '';

                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 8,
                        fill: new ol.style.Fill({
                            color: feature.get('trafficColor') || '#00c853'
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 2
                        })
                    }),
                    text: new ol.style.Text({
                        text: String(index),
                        fill: new ol.style.Fill({
                            color: '#ffffff'
                        }),
                        font: 'bold 11px sans-serif',
                        offsetY: 1
                    })
                });
            }
        });

        map.addLayer(trafficStepLayer);
    }

    function drawTrafficRoute(routeData) {
        if (
            typeof map === 'undefined' ||
            typeof ol === 'undefined' ||
            !routeData ||
            !routeData.route ||
            !routeData.route.paths ||
            !routeData.route.paths.length
        ) {
            return;
        }

        ensureTrafficRouteLayer();

        trafficRouteSource.clear();
        trafficStepSource.clear();

        const path = routeData.route.paths[0];
        const segments = path.trafficSegments || [];
        const instructions = path.instructionSteps || [];

        segments.forEach(function (segment) {
            if (!segment.coords || segment.coords.length < 2) {
                return;
            }

            const lineFeature = new ol.Feature({
                geometry: new ol.geom.LineString(segment.coords),
                trafficText: segment.trafficText,
                trafficColor: segment.trafficColor,
                road: segment.road,
                instruction: segment.instruction
            });

            trafficRouteSource.addFeature(lineFeature);
        });

        instructions.forEach(function (item) {
            if (!item.endCoord) {
                return;
            }

            const pointFeature = new ol.Feature({
                geometry: new ol.geom.Point(item.endCoord),
                index: item.index,
                instruction: item.instruction,
                road: item.road,
                trafficText: item.trafficText,
                trafficColor: item.trafficColor
            });

            trafficStepSource.addFeature(pointFeature);
        });

        if (trafficRouteSource.getFeatures().length > 0) {
            const extent = trafficRouteSource.getExtent();

            map.getView().fit(extent, {
                padding: [80, 420, 80, 320],
                duration: 600,
                maxZoom: 13
            });
        }
    }

    function insertRouteInstructionPanel(routeData) {
        const routeModal = document.getElementById('routeModal');

        if (
            !routeModal ||
            !routeData ||
            !routeData.route ||
            !routeData.route.paths ||
            !routeData.route.paths.length
        ) {
            return;
        }

        const path = routeData.route.paths[0];
        const summary = path.trafficSummary || null;
        const instructions = path.instructionSteps || [];

        let panel = document.getElementById('amapRouteInstructionPanel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'amapRouteInstructionPanel';

            panel.style.marginTop = '10px';
            panel.style.padding = '10px';
            panel.style.background = '#fff';
            panel.style.border = '1px solid #eee';
            panel.style.borderRadius = '8px';
            panel.style.maxHeight = '180px';
            panel.style.overflowY = 'auto';
            panel.style.fontSize = '13px';

            const routeBody =
                routeModal.querySelector('.modal-body') ||
                routeModal.querySelector('.route-result') ||
                routeModal;

            routeBody.appendChild(panel);
        }

        let html = '';

        if (summary) {
            html += `
                <div style="font-weight:bold;margin-bottom:8px;color:#333;">
                    实时路况：
                    <span style="color:${summary.color};">
                        ${summary.statusText}
                    </span>
                    <span style="font-weight:normal;color:#666;">
                        （畅通 ${summary.smoothCount} 段，缓行 ${summary.slowCount} 段，拥堵 ${summary.jamCount} 段，严重拥堵 ${summary.heavyJamCount} 段）
                    </span>
                </div>
            `;
        }

        html += `
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:12px;">
                <span><i style="display:inline-block;width:18px;height:5px;background:#00c853;"></i> 畅通</span>
                <span><i style="display:inline-block;width:18px;height:5px;background:#ffd600;"></i> 缓行</span>
                <span><i style="display:inline-block;width:18px;height:5px;background:#ff6d00;"></i> 拥堵</span>
                <span><i style="display:inline-block;width:18px;height:5px;background:#d50000;"></i> 严重拥堵</span>
            </div>
        `;

        if (instructions.length > 0) {
            html += `<div style="font-weight:bold;margin-bottom:6px;">路口 / 转向步骤</div>`;

            instructions.slice(0, 12).forEach(function (item) {
                html += `
                    <div style="border-top:1px dashed #ddd;padding:6px 0;">
                        <span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:${item.trafficColor};color:#fff;font-size:12px;margin-right:6px;">
                            ${item.index}
                        </span>
                        <span>${item.instruction}</span>
                        <span style="float:right;color:${item.trafficColor};font-weight:bold;">${item.trafficText}</span>
                    </div>
                `;
            });

            if (instructions.length > 12) {
                html += `
                    <div style="font-size:12px;color:#888;margin-top:5px;">
                        仅显示前 12 个路口步骤，共 ${instructions.length} 个步骤。
                    </div>
                `;
            }
        } else {
            html += `<div style="color:#888;">暂无详细路口步骤。</div>`;
        }

        panel.innerHTML = html;
    }

    // 最终接管 /api/route
    window.fetch = function (input, init) {
        const urlText = typeof input === 'string'
            ? input
            : input && input.url
                ? input.url
                : '';

        const lowerUrl = urlText.toLowerCase();

        if (lowerUrl.includes('api/route')) {
            return createAmapTrafficRouteResponse(urlText).then(function (routeData) {
                setTimeout(function () {
                    drawTrafficRoute(routeData);
                    insertRouteInstructionPanel(routeData);
                }, 500);

                setTimeout(function () {
                    drawTrafficRoute(routeData);
                    insertRouteInstructionPanel(routeData);
                }, 1200);

                return makeJsonResponse(routeData);
            });
        }

        return oldFetch(input, init);
    };

    window.clearAmapTrafficRoute = function () {
        if (trafficRouteSource) {
            trafficRouteSource.clear();
        }

        if (trafficStepSource) {
            trafficStepSource.clear();
        }

        const panel = document.getElementById('amapRouteInstructionPanel');

        if (panel) {
            panel.remove();
        }
    };

    // 如果你的清除路线按钮调用 clearRoute，也顺便清除彩色路况层
    const oldClearRoute = window.clearRoute;

    window.clearRoute = function () {
        if (typeof oldClearRoute === 'function') {
            oldClearRoute();
        }

        window.clearAmapTrafficRoute();
    };
})();

// =====================================================
// 高德天气最终清理版：单一入口，不闪烁、不抢控制权
// 说明：
// 1. 只保留这一套天气框逻辑；旧 loadWeather / queryAirQuality / startRealTimeUpdate 会被置空
// 2. 点击景点后立即显示“查询中”
// 3. 高德返回后原地更新，不再先消失再出现
// 4. 空气质量、人流量继续使用演示数据
// =====================================================
(function () {
    if (window.__cleanAmapWeatherInstalled) {
        return;
    }

    window.__cleanAmapWeatherInstalled = true;

    let weatherToken = 0;
    const weatherCache = {};
    const CACHE_TIME = 5 * 60 * 1000;

    if (!document.getElementById('cleanAmapWeatherStyle')) {
        const style = document.createElement('style');
        style.id = 'cleanAmapWeatherStyle';
        style.innerHTML = `
            #weatherPanel.clean-weather-active {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function getPanel() {
        let panel = document.getElementById('weatherPanel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'weatherPanel';
            document.body.appendChild(panel);
        }

        return panel;
    }

    function getFeatureName(feature) {
        if (!feature) return '';

        return (
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            feature.get('id') ||
            ''
        );
    }

    function getCityByFeature(feature, name) {
        if (!feature) return '北京市';

        const city =
            feature.get('city') ||
            feature.get('城市') ||
            '';

        if (city) {
            return city.endsWith('市') || city.includes('自治州') ? city : city + '市';
        }

        name = String(name || '');

        if (name.includes('故宫') || name.includes('天坛') || name.includes('颐和园') || name.includes('八达岭')) return '北京市';
        if (name.includes('西湖') || name.includes('灵隐') || name.includes('宋城')) return '杭州市';
        if (name.includes('黄山') || name.includes('宏村') || name.includes('西递')) return '黄山市';
        if (name.includes('桂林') || name.includes('漓江') || name.includes('阳朔')) return '桂林市';
        if (name.includes('丽江') || name.includes('玉龙') || name.includes('束河')) return '丽江市';
        if (name.includes('大理') || name.includes('崇圣寺')) return '大理市';
        if (name.includes('鼓浪屿') || name.includes('厦门')) return '厦门市';
        if (name.includes('武夷山')) return '南平市';
        if (name.includes('九寨沟') || name.includes('黄龙')) return '阿坝藏族羌族自治州';
        if (name.includes('都江堰') || name.includes('峨眉山')) return '成都市';
        if (name.includes('兵马俑') || name.includes('大雁塔') || name.includes('华清宫') || name.includes('西安')) return '西安市';
        if (name.includes('华山')) return '渭南市';
        if (name.includes('苏州') || name.includes('拙政园') || name.includes('虎丘')) return '苏州市';
        if (name.includes('广州') || name.includes('陈家祠')) return '广州市';
        if (name.includes('布达拉宫')) return '拉萨市';
        if (name.includes('承德')) return '承德市';
        if (name.includes('凤凰古城')) return '湘西土家族苗族自治州';
        if (name.includes('张家界')) return '张家界市';
        if (name.includes('龙门石窟')) return '洛阳市';
        if (name.includes('平遥')) return '晋中市';
        if (name.includes('曲阜')) return '济宁市';

        return '北京市';
    }

    function hashText(text) {
        text = String(text || '');
        let hash = 0;

        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }

        return Math.abs(hash);
    }

    function randomByKey(key, min, max) {
        const seed = hashText(key);
        const x = Math.sin(seed) * 10000;
        const ratio = x - Math.floor(x);

        return Math.round(min + ratio * (max - min));
    }

    function getExtraData(name, city) {
        const aqi = randomByKey(city + '_aqi', 38, 88);
        const crowd = randomByKey(name + '_crowd', 25, 92);

        let airLevel = '良';
        let airColor = '#f1c40f';

        if (aqi <= 50) {
            airLevel = '优';
            airColor = '#2ecc71';
        }

        let crowdLevel = '舒适';
        let crowdColor = '#2ecc71';

        if (crowd < 40) {
            crowdLevel = '舒适';
            crowdColor = '#2ecc71';
        } else if (crowd < 65) {
            crowdLevel = '适中';
            crowdColor = '#f1c40f';
        } else if (crowd < 82) {
            crowdLevel = '拥挤';
            crowdColor = '#e67e22';
        } else {
            crowdLevel = '爆满';
            crowdColor = '#e74c3c';
        }

        return {
            aqi: aqi,
            crowd: crowd,
            airLevel: airLevel,
            airColor: airColor,
            crowdLevel: crowdLevel,
            crowdColor: crowdColor,
            pm25: Math.max(10, Math.round(aqi * 0.45)),
            pm10: Math.max(20, Math.round(aqi * 0.78))
        };
    }

    function getIcon(weather) {
        weather = String(weather || '');

        if (weather.includes('晴')) return '☀️';
        if (weather.includes('雨')) return '🌧️';
        if (weather.includes('雪')) return '❄️';
        if (weather.includes('雷')) return '⛈️';
        if (weather.includes('阴')) return '🌥️';

        return '⛅';
    }

    function renderCleanWeather(feature, weatherData, loading) {
        const name = getFeatureName(feature);
        const city = getCityByFeature(feature, name);
        const extra = getExtraData(name, city);

        const weather = loading ? '查询中' : (weatherData.weather || '多云');
        const temp = loading ? '--' : (weatherData.temperature || '--');
        const humidity = loading ? '--' : (weatherData.humidity || '--');
        const windDirection = loading ? '--' : (weatherData.windDirection || '--');
        const windPower = loading ? '--' : (weatherData.windPower || '--');

        const panel = getPanel();

        panel.classList.add('clean-weather-active');
        panel.style.display = 'block';
        panel.style.visibility = 'visible';
        panel.style.opacity = '1';
        panel.style.position = 'absolute';
        panel.style.left = '315px';
        panel.style.top = '185px';
        panel.style.zIndex = '9999';
        panel.style.width = '230px';
        panel.style.background = 'linear-gradient(135deg, #5b6ee1, #7d4ac7)';
        panel.style.borderRadius = '8px';
        panel.style.boxShadow = '0 4px 14px rgba(0,0,0,0.28)';
        panel.style.color = '#fff';
        panel.style.fontSize = '12px';
        panel.style.overflow = 'hidden';

        panel.innerHTML = `
            <div style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.25); position: relative;">
                <button type="button" onclick="closeStaticWeatherPanel()" style="position:absolute;right:6px;top:5px;border:none;background:rgba(255,255,255,0.18);color:#fff;border-radius:50%;width:22px;height:22px;line-height:20px;font-size:16px;cursor:pointer;">×</button>

                <div style="display:flex;align-items:center;justify-content:space-between;padding-right:26px;">
                    <div style="font-size:20px;">${getIcon(weather)}</div>
                    <div style="text-align:right;">
                        <div style="font-size:17px;font-weight:bold;">${temp}℃</div>
                        <div style="font-size:11px;">${weather}</div>
                    </div>
                </div>

                <div style="margin-top:4px;font-size:11px;opacity:0.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${city} · ${name}
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.2);">
                <div>
                    <div>💧</div>
                    <div>${humidity}%</div>
                </div>
                <div>
                    <div>🌫️</div>
                    <div>AQI ${extra.aqi}</div>
                </div>
                <div>
                    <div>👥</div>
                    <div>${extra.crowd}%</div>
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.94);color:#333;padding:8px 10px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span>风向风力</span>
                    <span>${windDirection}风 ${windPower}级</span>
                </div>

                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span>空气质量</span>
                    <span style="color:${extra.airColor};font-weight:bold;">${extra.airLevel}</span>
                </div>

                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span>人流量</span>
                    <span style="color:${extra.crowdColor};font-weight:bold;">${extra.crowdLevel}</span>
                </div>

                <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px;color:#666;">
                    <span>PM2.5：${extra.pm25}</span>
                    <span>PM10：${extra.pm10}</span>
                </div>
            </div>
        `;
    }

    window.closeStaticWeatherPanel = function () {
        const panel = getPanel();

        panel.classList.remove('clean-weather-active');
        panel.style.display = 'none';

        weatherToken++;
    };

    window.showCleanAmapWeatherForFeature = function (feature) {
        if (!feature || !feature.getGeometry()) return;

        const token = ++weatherToken;
        const name = getFeatureName(feature);
        const city = getCityByFeature(feature, name);

        renderCleanWeather(feature, {}, true);

        const cached = weatherCache[city];

        if (cached && Date.now() - cached.time < CACHE_TIME) {
            renderCleanWeather(feature, cached.data, false);
            return;
        }

        if (!window.AMap || !AMap.Weather) {
            const fallback = {
                weather: '多云',
                temperature: 28,
                humidity: 60,
                windDirection: '东南',
                windPower: '2'
            };

            renderCleanWeather(feature, fallback, false);
            return;
        }

        AMap.plugin('AMap.Weather', function () {
            const weather = new AMap.Weather();

            weather.getLive(city, function (err, data) {
                if (token !== weatherToken) return;

                if (err || !data) {
                    data = {
                        weather: '多云',
                        temperature: 28,
                        humidity: 60,
                        windDirection: '东南',
                        windPower: '2'
                    };
                }

                weatherCache[city] = {
                    time: Date.now(),
                    data: data
                };

                renderCleanWeather(feature, data, false);
            });
        });
    };

    // 关闭旧天气入口，避免它们再次和新天气框抢 display。
    window.loadWeather = function () { return Promise.resolve(null); };
    window.loadWeatherData = function () { return Promise.resolve(null); };
    window.queryWeather = function () { return Promise.resolve(null); };
    window.queryAirQuality = function () { return Promise.resolve(null); };
    window.loadAirQualityData = function () { return Promise.resolve(null); };
    window.startRealTimeUpdate = function () { return null; };
    window.stopRealTimeUpdate = function () { return null; };

    const panel = getPanel();
    panel.classList.remove('clean-weather-active');
    panel.style.display = 'none';
})();

// =====================================================
// 天气框 / 属性信息框 白名单清除控制
// 允许显示的操作只有：
// 1. 点击地图中的景点
// 2. 景点查询
// 3. 属性查询
// 其他功能：自动清除天气框和属性信息框
// =====================================================
(function () {
    if (window.__attractionPanelWhitelistControlInstalled) {
        return;
    }

    window.__attractionPanelWhitelistControlInstalled = true;

    function hideAttractionWeatherAndInfo() {
    const weatherPanel = document.getElementById('weatherPanel');

    if (weatherPanel) {
        weatherPanel.classList.remove(
            'clean-weather-active',
            'light-weather-active',
            'weather-lock-active'
        );

        weatherPanel.style.display = 'none';
        weatherPanel.style.visibility = 'hidden';
        weatherPanel.style.opacity = '0';
    }

    const featureInfo = document.getElementById('featureInfo');

    if (featureInfo) {
        const text = featureInfo.innerText || featureInfo.textContent || '';

        if (
            text.includes('框选查询结果') ||
            text.includes('圆选查询结果') ||
            text.includes('多边形查询结果') ||
            text.includes('空间查询结果')
        ) {
            currentSelectedFeature = null;
            window.currentSelectedFeature = null;
            return;
        }

        featureInfo.innerHTML = '';
        featureInfo.style.display = 'none';
    }

    const infoPanel = document.getElementById('infoPanel');

    if (infoPanel) {
        infoPanel.classList.remove('show');
        infoPanel.style.display = 'none';
    }

    currentSelectedFeature = null;
    window.currentSelectedFeature = null;
}

    function isAttractionFeature(feature) {
        if (!feature || !feature.getGeometry()) {
            return false;
        }

        const name =
            feature.get('name') ||
            feature.get('title') ||
            feature.get('名称') ||
            '';

        if (!name) {
            return false;
        }

        const type = feature.get('type') || feature.get('drawType') || '';

        return ![
            'box_select',
            'circle_select',
            'polygon_select',
            'spatial_query',
            'route',
            'track',
            'draw',
            'user_draw',
            'measure',
            'buffer',
            'overlayPoint'
        ].includes(type);
    }

    function isAllowedFeatureInfoAction(target) {
        if (!target) {
            return false;
        }

        const onclickText =
            target.getAttribute && target.getAttribute('onclick')
                ? target.getAttribute('onclick')
                : '';

        const text = (
            target.innerText ||
            target.textContent ||
            ''
        );

        const nearbyText = (
            target.closest('.query-section, .dropdown, .dropdown-menu, .right-panel, .card, .mb-3, .form-group')?.innerText ||
            ''
        );

        // 景点查询允许
        if (
            onclickText.includes('queryAttraction') ||
            target.closest('#attractionsMenu') ||
            nearbyText.includes('景点查询')
        ) {
            return true;
        }

        // 属性查询允许
        if (
            onclickText.includes('searchAttractionsByAttribute') ||
            target.id === 'attrSearchKeyword' ||
            target.id === 'attrSearchCategory' ||
            text.includes('属性查询') ||
            nearbyText.includes('属性查询')
        ) {
            return true;
        }

        return false;
    }

    // 点击地图：只有点到景点允许保留；点空白或其他图形清除
    if (typeof map !== 'undefined' && map) {
        map.on('singleclick', function (evt) {
            setTimeout(function () {
                let clickedAttraction = null;

                map.forEachFeatureAtPixel(evt.pixel, function (feature) {
                    if (isAttractionFeature(feature)) {
                        clickedAttraction = feature;
                        return true;
                    }

                    return false;
                });

                if (!clickedAttraction) {
                    hideAttractionWeatherAndInfo();
                }
            }, 100);
        });
    }

    // 点击除“地图景点 / 景点查询 / 属性查询”之外的功能，清除两个框
    document.addEventListener('click', function (event) {
        const target = event.target;

        if (!target) {
            return;
        }

        // 地图点击交给 map.singleclick 判断
        if (target.closest('#map')) {
            return;
        }

        // 点天气框自己，不清除
        if (target.closest('#weatherPanel')) {
            return;
        }

        // 点属性信息框自己，不清除
        if (target.closest('#featureInfo')) {
            return;
        }

        // 景点查询、属性查询是白名单，不清除
        if (isAllowedFeatureInfoAction(target)) {
            return;
        }

        const isFunctionElement =
            target.closest('button') ||
            target.closest('a') ||
            target.closest('select') ||
            target.closest('input') ||
            target.closest('.btn') ||
            target.closest('.dropdown-item') ||
            target.closest('.nav-link') ||
            target.closest('.tool-btn');

        if (isFunctionElement) {
            hideAttractionWeatherAndInfo();
        }
    }, true);

    // 下拉框变化：只有景点查询 / 属性查询允许，其余清除
    document.addEventListener('change', function (event) {
        const target = event.target;

        if (!target) {
            return;
        }

        if (
            target.closest('#weatherPanel') ||
            target.closest('#featureInfo')
        ) {
            return;
        }

        if (isAllowedFeatureInfoAction(target)) {
            return;
        }

        if (
            target.tagName === 'SELECT' ||
            target.tagName === 'INPUT'
        ) {
            hideAttractionWeatherAndInfo();
        }
    }, true);

    window.hideAttractionWeatherAndInfo = hideAttractionWeatherAndInfo;
})();

// =====================================================
// 缓冲区分析自动清除控制
// 规则：
// 1. 点击“缓冲区分析”本身，不清除，允许继续做缓冲区
// 2. 点击除“缓冲区分析”以外的其他功能按钮/菜单/下拉框，自动清除缓冲区图形
// 3. 不影响缓冲区分析结果文字，只清除地图上的缓冲区绘制要素
// =====================================================
(function () {
    if (window.__bufferAutoClearInstalled) {
        return;
    }

    window.__bufferAutoClearInstalled = true;

    function clearBufferAnalysisFeatures() {
        if (typeof bufferSource !== 'undefined' && bufferSource) {
            bufferSource.clear();
        }
    }

    window.clearBufferAnalysisFeatures = clearBufferAnalysisFeatures;

    function isBufferAnalysisAction(target) {
        if (!target) {
            return false;
        }

        const onclickText =
            target.getAttribute && target.getAttribute('onclick')
                ? target.getAttribute('onclick')
                : '';

        const text = (
            target.innerText ||
            target.textContent ||
            ''
        );

        const nearbyText = (
            target.closest('.sidebar, .right-panel, .query-section, .card, .dropdown, .dropdown-menu')?.innerText ||
            ''
        );

        return (
            onclickText.includes('startBufferAnalysis') ||
            text.includes('缓冲区分析') ||
            nearbyText.includes('缓冲区分析') && target.closest('button, a, .btn, .tool-btn')
        );
    }

    document.addEventListener('click', function (event) {
        const target = event.target;

        if (!target) {
            return;
        }

        // 地图本体点击不清除，避免影响缓冲区分析时选择中心景点
        if (target.closest('#map')) {
            return;
        }

        // 点击缓冲区分析按钮本身，不清除
        if (isBufferAnalysisAction(target)) {
            return;
        }

        const isFunctionElement =
            target.closest('button') ||
            target.closest('a') ||
            target.closest('select') ||
            target.closest('input') ||
            target.closest('.btn') ||
            target.closest('.dropdown-item') ||
            target.closest('.nav-link') ||
            target.closest('.tool-btn');

        if (isFunctionElement) {
            clearBufferAnalysisFeatures();
        }
    }, true);

    document.addEventListener('change', function (event) {
        const target = event.target;

        if (!target) {
            return;
        }

        if (isBufferAnalysisAction(target)) {
            return;
        }

        if (
            target.tagName === 'SELECT' ||
            target.tagName === 'INPUT'
        ) {
            clearBufferAnalysisFeatures();
        }
    }, true);

    // 兼容：如果用户点了“清除要素”，也一起清除缓冲区
    const oldClearFeatures = window.clearFeatures;

    window.clearFeatures = function () {
        if (typeof oldClearFeatures === 'function') {
            oldClearFeatures.apply(this, arguments);
        }

        clearBufferAnalysisFeatures();
    };
})();

// =====================================================
// 模拟轨迹最终修复版
// 作用：
// 1. 再次点击“模拟轨迹”时，自动清除上一次地图上的轨迹
// 2. 模拟轨迹直接调用高德 AMap.Driving 获取道路轨迹，不再走 /api/route
// 3. 生成轨迹后不自动播放
// 4. 点击“播放轨迹”时，按 起点 → 途经点 → 终点 慢速播放
// =====================================================
(function () {
    if (window.__finalSimTrackPatchInstalled) {
        return;
    }

    window.__finalSimTrackPatchInstalled = true;

    function clearCurrentTrackOnMap() {
        if (typeof trackAnimation !== 'undefined' && trackAnimation) {
            cancelAnimationFrame(trackAnimation);
            trackAnimation = null;
        }

        if (typeof trackSource !== 'undefined' && trackSource) {
            trackSource.clear();
        }

        if (typeof trackMarkerSource !== 'undefined' && trackMarkerSource) {
            trackMarkerSource.clear();
        }

        if (typeof currentTrackPoints !== 'undefined') {
            currentTrackPoints = [];
        }

        // 防止路线规划的彩色路况线残留
        if (typeof window.clearAmapTrafficRoute === 'function') {
            window.clearAmapTrafficRoute();
        }
    }

    function parseTrackCoord(value) {
        if (!value) {
            return null;
        }

        const text = String(value).trim();

        // 情况1：[113.1,23.1]
        try {
            const parsed = JSON.parse(text);

            if (
                Array.isArray(parsed) &&
                parsed.length >= 2 &&
                !isNaN(Number(parsed[0])) &&
                !isNaN(Number(parsed[1]))
            ) {
                return [Number(parsed[0]), Number(parsed[1])];
            }
        } catch (e) {}

        // 情况2：113.1,23.1
        const match = text.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);

        if (match) {
            return [Number(match[1]), Number(match[3])];
        }

        // 情况3：下拉框 value 是景点名称
        if (typeof attractionsSource !== 'undefined' && attractionsSource) {
            const features = attractionsSource.getFeatures();

            const found = features.find(function (feature) {
                const name =
                    feature.get('name') ||
                    feature.get('title') ||
                    feature.get('名称') ||
                    '';

                return name === text || name.includes(text) || text.includes(name);
            });

            if (found && found.getGeometry()) {
                const coord = found.getGeometry().getCoordinates();
                return [Number(coord[0]), Number(coord[1])];
            }
        }

        return null;
    }

    function createFallbackSegment(start, end) {
        const coords = [];
        const count = 50;

        const dx = end[0] - start[0];
        const dy = end[1] - start[1];

        for (let i = 0; i <= count; i++) {
            const t = i / count;

            let lon = start[0] + dx * t;
            let lat = start[1] + dy * t;

            // 兜底时也不要完全直线，稍微弯曲
            const curve = Math.sin(Math.PI * t) * 0.035;
            lon += -dy * curve;
            lat += dx * curve;

            coords.push([
                Number(lon.toFixed(6)),
                Number(lat.toFixed(6))
            ]);
        }

        return coords;
    }

    function extractCoordsFromAmapDriving(result) {
        const coords = [];

        const route =
            result &&
            result.routes &&
            result.routes.length > 0
                ? result.routes[0]
                : null;

        if (!route || !route.steps) {
            return coords;
        }

        route.steps.forEach(function (step) {
            // AMap JSAPI 通常是 step.path
            if (step.path && step.path.length > 0) {
                step.path.forEach(function (point) {
                    let lon = null;
                    let lat = null;

                    if (point && typeof point.getLng === 'function') {
                        lon = point.getLng();
                        lat = point.getLat();
                    } else if (point) {
                        lon = point.lng;
                        lat = point.lat;
                    }

                    if (lon != null && lat != null) {
                        coords.push([Number(lon), Number(lat)]);
                    }
                });
            }

            // 兜底兼容 polyline 字符串
            if (step.polyline) {
                step.polyline.split(';').forEach(function (item) {
                    const parts = item.split(',');

                    if (parts.length === 2) {
                        const lon = parseFloat(parts[0]);
                        const lat = parseFloat(parts[1]);

                        if (!isNaN(lon) && !isNaN(lat)) {
                            coords.push([lon, lat]);
                        }
                    }
                });
            }
        });

        return coords;
    }

    function getAmapTrackSegment(start, end) {
        return new Promise(function (resolve) {
            if (
                typeof AMap === 'undefined' ||
                typeof AMap.Driving === 'undefined'
            ) {
                resolve(createFallbackSegment(start, end));
                return;
            }

            const driving = new AMap.Driving({
                showTraffic: false,
                hideMarkers: true
            });

            const amapStart = new AMap.LngLat(start[0], start[1]);
            const amapEnd = new AMap.LngLat(end[0], end[1]);

            driving.search(amapStart, amapEnd, function (status, result) {
                if (status !== 'complete') {
                    console.warn('高德轨迹获取失败，使用兜底模拟轨迹：', result);
                    resolve(createFallbackSegment(start, end));
                    return;
                }

                const coords = extractCoordsFromAmapDriving(result);

                if (coords.length < 2) {
                    resolve(createFallbackSegment(start, end));
                    return;
                }

                resolve(coords);
            });
        });
    }

    function addTrackPointMarker(coord, text, color) {
        const marker = new ol.Feature({
            geometry: new ol.geom.Point(coord)
        });

        marker.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 9,
                fill: new ol.style.Fill({
                    color: color
                }),
                stroke: new ol.style.Stroke({
                    color: '#ffffff',
                    width: 3
                })
            }),
            text: new ol.style.Text({
                text: text,
                font: 'bold 12px Microsoft YaHei',
                fill: new ol.style.Fill({
                    color: '#ffffff'
                })
            })
        }));

        trackMarkerSource.addFeature(marker);
    }

    // 覆盖原来的“模拟轨迹”按钮入口
    const oldStartTrackDraw = window.startTrackDraw;

    window.startTrackDraw = function () {
        // 再次点击模拟轨迹时，先清除上一次地图上的轨迹
        clearCurrentTrackOnMap();

        if (typeof oldStartTrackDraw === 'function') {
            oldStartTrackDraw();
        }
    };

    // 覆盖原来的确认模拟轨迹函数
    window.confirmTrackSelection = function () {
        clearCurrentTrackOnMap();

        const originSelect = document.getElementById('trackOrigin');
        const waypointsSelect = document.getElementById('trackWaypoints');
        const destinationSelect = document.getElementById('trackDestination');

        if (!originSelect || !destinationSelect) {
            alert('没有找到模拟轨迹的起点或终点选择框。');
            return;
        }

        const originCoord = parseTrackCoord(originSelect.value);
        const destCoord = parseTrackCoord(destinationSelect.value);

        if (!originCoord) {
            alert('请选择有效起点。');
            return;
        }

        if (!destCoord) {
            alert('请选择有效终点。');
            return;
        }

        const waypointCoords = waypointsSelect
            ? Array.from(waypointsSelect.selectedOptions)
                .map(function (option) {
                    return parseTrackCoord(option.value);
                })
                .filter(function (coord) {
                    return !!coord;
                })
            : [];

        const allPoints = [originCoord].concat(waypointCoords).concat([destCoord]);

        const modalBody = document.querySelector('#trackModal .modal-body');
        const oldLoading = document.getElementById('trackLoadingMsg');

        if (oldLoading) {
            oldLoading.remove();
        }

        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'alert alert-info';
        loadingMsg.id = 'trackLoadingMsg';
        loadingMsg.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 正在调用高德路线生成模拟轨迹，请稍候...';

        if (modalBody) {
            modalBody.appendChild(loadingMsg);
        }

        const tasks = [];

        for (let i = 0; i < allPoints.length - 1; i++) {
            tasks.push(getAmapTrackSegment(allPoints[i], allPoints[i + 1]));
        }

        Promise.all(tasks)
            .then(function (segments) {
                const loadingEl = document.getElementById('trackLoadingMsg');

                if (loadingEl) {
                    loadingEl.remove();
                }

                let routeCoords = [];

                segments.forEach(function (coords, index) {
                    if (coords.length > 0) {
                        if (index > 0 && routeCoords.length > 0) {
                            routeCoords.pop();
                        }

                        routeCoords = routeCoords.concat(coords);
                    }
                });

                if (routeCoords.length < 2) {
                    alert('模拟轨迹生成失败。');
                    return;
                }

                currentTrackPoints = routeCoords;

                const lineFeature = new ol.Feature({
                    geometry: new ol.geom.LineString(routeCoords)
                });

                lineFeature.setProperties({
                    type: 'simulated_track',
                    name: '模拟轨迹'
                });

                lineFeature.setStyle(new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: '#e91e63',
                        width: 4,
                        lineDash: [10, 6]
                    })
                }));

                trackSource.addFeature(lineFeature);

                addTrackPointMarker(originCoord, '起', '#4CAF50');

                waypointCoords.forEach(function (coord, index) {
                    addTrackPointMarker(coord, String(index + 1), '#FF9800');
                });

                addTrackPointMarker(destCoord, '终', '#F44336');

                const extent = trackSource.getExtent();

                if (!ol.extent.isEmpty(extent)) {
                    map.getView().fit(extent, {
                        padding: [80, 420, 80, 80],
                        duration: 500,
                        maxZoom: 12
                    });
                }

                const trackModalEl = document.getElementById('trackModal');
                const trackModal = trackModalEl
                    ? bootstrap.Modal.getInstance(trackModalEl)
                    : null;

                if (trackModal) {
                    trackModal.hide();
                }

                const originName = originSelect.options[originSelect.selectedIndex]?.text || '起点';
                const destName = destinationSelect.options[destinationSelect.selectedIndex]?.text || '终点';

                savedTracks.push({
                    name: originName + ' → ' + destName,
                    points: routeCoords
                });

                alert('模拟轨迹已生成。如需播放，请点击“播放轨迹”。');
            })
            .catch(function (err) {
                const loadingEl = document.getElementById('trackLoadingMsg');

                if (loadingEl) {
                    loadingEl.remove();
                }

                console.error('模拟轨迹生成失败：', err);
                alert('模拟轨迹生成失败，请稍后重试。');
            });
    };

    // 覆盖播放函数：速度变慢，按轨迹点顺序播放
    window.playTrackAnimation = function (points) {
        if (!points || points.length < 2) {
            alert('轨迹点不足');
            return;
        }

        if (trackAnimation) {
            cancelAnimationFrame(trackAnimation);
            trackAnimation = null;
        }

        trackMarkerSource.clear();

        let currentIndex = 0;
        let progress = 0;

        // 数值越小越慢
        const speed = 0.08;

        function animate() {
            if (currentIndex >= points.length - 1) {
                return;
            }

            const startPoint = points[currentIndex];
            const endPoint = points[currentIndex + 1];

            progress += speed;

            if (progress >= 1) {
                progress = 0;
                currentIndex++;

                if (currentIndex >= points.length - 1) {
                    const endMarker = new ol.Feature({
                        geometry: new ol.geom.Point(points[points.length - 1])
                    });

                    endMarker.setStyle(new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 10,
                            fill: new ol.style.Fill({
                                color: '#F44336'
                            }),
                            stroke: new ol.style.Stroke({
                                color: '#ffffff',
                                width: 3
                            })
                        }),
                        text: new ol.style.Text({
                            text: '终',
                            font: 'bold 12px Microsoft YaHei',
                            fill: new ol.style.Fill({
                                color: '#ffffff'
                            })
                        })
                    }));

                    trackMarkerSource.clear();
                    trackMarkerSource.addFeature(endMarker);
                    return;
                }
            }

            const currentX = startPoint[0] + (endPoint[0] - startPoint[0]) * progress;
            const currentY = startPoint[1] + (endPoint[1] - startPoint[1]) * progress;

            trackMarkerSource.clear();

            const markerFeature = new ol.Feature({
                geometry: new ol.geom.Point([currentX, currentY])
            });

            markerFeature.setStyle(new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 9,
                    fill: new ol.style.Fill({
                        color: '#e91e63'
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#ffffff',
                        width: 3
                    })
                })
            }));

            trackMarkerSource.addFeature(markerFeature);

            trackAnimation = requestAnimationFrame(animate);
        }

        animate();
    };
})();

// =====================================================
// 播放轨迹移动图标优化版
// 作用：
// 1. 把播放轨迹的移动点换成蓝色坐标定位图标
// 2. 播放速度比之前更快一些
// =====================================================
(function () {
    if (window.__trackMovingIconPatchInstalled) {
        return;
    }

    window.__trackMovingIconPatchInstalled = true;

    function createMovingLocationIcon() {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 64 64">
                <path d="M32 4C20.4 4 11 13.4 11 25c0 16.5 21 35 21 35s21-18.5 21-35C53 13.4 43.6 4 32 4z"
                      fill="#1976D2"
                      stroke="#ffffff"
                      stroke-width="4"/>
                <circle cx="32" cy="25" r="8"
                        fill="#ffffff"/>
                <circle cx="32" cy="25" r="4"
                        fill="#1976D2"/>
            </svg>
        `;

        return new ol.style.Style({
            image: new ol.style.Icon({
                src: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
                scale: 1,
                anchor: [0.5, 1]
            })
        });
    }

    window.playTrackAnimation = function (points) {
        if (!points || points.length < 2) {
            alert('轨迹点不足');
            return;
        }

        if (trackAnimation) {
            cancelAnimationFrame(trackAnimation);
            trackAnimation = null;
        }

        trackMarkerSource.clear();

        let currentIndex = 0;
        let progress = 0;

        
        const speed = 9;

        const movingStyle = createMovingLocationIcon();

        function animate() {
            if (currentIndex >= points.length - 1) {
                return;
            }

            const startPoint = points[currentIndex];
            const endPoint = points[currentIndex + 1];

            progress += speed;

            if (progress >= 1) {
                progress = 0;
                currentIndex++;

                if (currentIndex >= points.length - 1) {
                    trackMarkerSource.clear();

                    const endMarker = new ol.Feature({
                        geometry: new ol.geom.Point(points[points.length - 1])
                    });

                    endMarker.setStyle(movingStyle);
                    trackMarkerSource.addFeature(endMarker);

                    return;
                }
            }

            const currentX = startPoint[0] + (endPoint[0] - startPoint[0]) * progress;
            const currentY = startPoint[1] + (endPoint[1] - startPoint[1]) * progress;

            trackMarkerSource.clear();

            const markerFeature = new ol.Feature({
                geometry: new ol.geom.Point([currentX, currentY])
            });

            markerFeature.setStyle(movingStyle);
            trackMarkerSource.addFeature(markerFeature);

            trackAnimation = requestAnimationFrame(animate);
        }

        animate();
    };
})();

// =====================================================
// 播放轨迹加速最终版
// 作用：真正加快播放速度，每一帧跳过多个轨迹点
// =====================================================
(function () {
    if (window.__trackReallyFastPatchInstalled) {
        return;
    }

    window.__trackReallyFastPatchInstalled = true;

    function createMovingLocationIcon() {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 64 64">
                <path d="M32 4C20.4 4 11 13.4 11 25c0 16.5 21 35 21 35s21-18.5 21-35C53 13.4 43.6 4 32 4z"
                      fill="#1976D2"
                      stroke="#ffffff"
                      stroke-width="4"/>
                <circle cx="32" cy="25" r="8" fill="#ffffff"/>
                <circle cx="32" cy="25" r="4" fill="#1976D2"/>
            </svg>
        `;

        return new ol.style.Style({
            image: new ol.style.Icon({
                src: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
                scale: 1,
                anchor: [0.5, 1]
            })
        });
    }

    window.playTrackAnimation = function (points) {
        if (!points || points.length < 2) {
            alert('轨迹点不足');
            return;
        }

        if (trackAnimation) {
            cancelAnimationFrame(trackAnimation);
            trackAnimation = null;
        }

        trackMarkerSource.clear();

        let currentIndex = 0;

        // 真正控制速度的是这个：
        // 数值越大，每一帧跳过的轨迹点越多，播放越快
        const pointsPerFrame = 18;

        const movingStyle = createMovingLocationIcon();

        function drawMarker(coord) {
            trackMarkerSource.clear();

            const markerFeature = new ol.Feature({
                geometry: new ol.geom.Point(coord)
            });

            markerFeature.setStyle(movingStyle);
            trackMarkerSource.addFeature(markerFeature);
        }

        function animate() {
            if (currentIndex >= points.length - 1) {
                drawMarker(points[points.length - 1]);
                trackAnimation = null;
                return;
            }

            currentIndex += pointsPerFrame;

            if (currentIndex >= points.length) {
                currentIndex = points.length - 1;
            }

            drawMarker(points[currentIndex]);

            trackAnimation = requestAnimationFrame(animate);
        }

        drawMarker(points[0]);
        trackAnimation = requestAnimationFrame(animate);
    };
})();

// =====================================================
// 更多结果信息属性框显示修复版
// 作用：防止“智能推荐 / 路线分析 / 文创建议 / 游客服务圈”等业务分析结果
// 被前面的天气框/属性框白名单清除逻辑误清空
// =====================================================
(function () {
    if (window.__businessResultPanelFixInstalled) {
        return;
    }

    window.__businessResultPanelFixInstalled = true;

    const oldShowBusinessResult = window.showBusinessResult;

    window.showBusinessResult = function (title, html) {
        const featureInfo = document.getElementById('featureInfo');
        const infoPanel = document.getElementById('infoPanel');

        if (!featureInfo) {
            alert(title || '分析结果');
            return;
        }

        const content = `
            <div class="business-result-content">
                <h6 style="color:#b22126;font-weight:bold;margin-bottom:10px;">
                    ${title || '分析结果'}
                </h6>
                ${html || ''}
            </div>
        `;

        // 先正常写一次
        featureInfo.innerHTML = content;
        featureInfo.style.display = 'block';

        if (infoPanel) {
            infoPanel.style.display = 'block';
            infoPanel.classList.add('show');
        }

        if (typeof showInfoPanel === 'function') {
            showInfoPanel();
        }

        // 关键：延迟再写一次
        // 因为按钮点击事件冒泡后，白名单清除逻辑可能会把内容清掉
        setTimeout(function () {
            const featureInfoAgain = document.getElementById('featureInfo');
            const infoPanelAgain = document.getElementById('infoPanel');

            if (featureInfoAgain) {
                featureInfoAgain.innerHTML = content;
                featureInfoAgain.style.display = 'block';
            }

            if (infoPanelAgain) {
                infoPanelAgain.style.display = 'block';
                infoPanelAgain.classList.add('show');
            }

            if (typeof showInfoPanel === 'function') {
                showInfoPanel();
            }
        }, 30);
    };
})();

// =====================================================
// 叠加分析结果属性框显示修复版
// 作用：绘制完叠加分析区域后，强制弹出属性信息框并保留结果内容
// =====================================================
(function () {
    if (window.__overlayResultPanelFixInstalled) {
        return;
    }

    window.__overlayResultPanelFixInstalled = true;

    const oldShowOverlayAnalysisResult = window.showOverlayAnalysisResult;

    window.showOverlayAnalysisResult = function (
        resultFeatures,
        categoryStats,
        cityStats,
        areaText,
        averageRating
    ) {
        // 先执行你原来的叠加分析结果生成逻辑
        if (typeof oldShowOverlayAnalysisResult === 'function') {
            oldShowOverlayAnalysisResult(
                resultFeatures,
                categoryStats,
                cityStats,
                areaText,
                averageRating
            );
        } else {
            // 兜底：如果原函数丢了，也能显示基础结果
            const featureInfo = document.getElementById('featureInfo');

            if (featureInfo) {
                featureInfo.innerHTML = `
                    <h5 style="color:#b22126;font-weight:bold;">叠加分析结果</h5>
                    <hr>
                    <p><strong>分析区域面积：</strong>${areaText || '暂无'}</p>
                    <p><strong>区域内景点数量：</strong>${resultFeatures ? resultFeatures.length : 0} 个</p>
                    <p><strong>平均评分：</strong>${averageRating || '暂无'}</p>
                `;
            }
        }

        function forceShowOverlayPanel() {
            const featureInfo = document.getElementById('featureInfo');
            const infoPanel = document.getElementById('infoPanel');

            if (featureInfo) {
                // 如果原函数生成了内容，就保留原内容；如果没有内容，就补基础结果
                if (!featureInfo.innerHTML.trim()) {
                    featureInfo.innerHTML = `
                        <h5 style="color:#b22126;font-weight:bold;">叠加分析结果</h5>
                        <hr>
                        <p><strong>分析区域面积：</strong>${areaText || '暂无'}</p>
                        <p><strong>区域内景点数量：</strong>${resultFeatures ? resultFeatures.length : 0} 个</p>
                        <p><strong>平均评分：</strong>${averageRating || '暂无'}</p>
                    `;
                }

                featureInfo.style.display = 'block';
            }

            if (infoPanel) {
                infoPanel.style.display = 'block';
                infoPanel.style.visibility = 'visible';
                infoPanel.style.opacity = '1';
                infoPanel.classList.add('show');
            }

            if (typeof showInfoPanel === 'function') {
                showInfoPanel();
            }
        }

        // 立即显示一次
        forceShowOverlayPanel();

        // 延迟再显示两次，防止前面的白名单清除逻辑把它关掉
        setTimeout(forceShowOverlayPanel, 50);
        setTimeout(forceShowOverlayPanel, 200);
    };
})();