const translations = {
    'zh-CN': {
        language: '中文简体',
        brand: '智游名城',
        nav: {
            mapTools: '地图工具',
            importGeoJSON: '导入GeoJSON',
            exportGeoJSON: '导出GeoJSON'
        },
        toolbar: {
            switchBasemap: '切换底图',
            gaodeMap: '高德地图',
            esriSatellite: 'Esri卫星',
            gaodeSatellite: '高德卫星',
            reset: '复位',
            queryAttraction: '景点查询',
            selectAttraction: '-- 请选择景点 --',
            drawPoint: '绘制点',
            drawLine: '绘制线',
            drawPolygon: '绘制面',
            boxSelect: '框选查询',
            simulateTrack: '模拟轨迹',
            playTrack: '播放轨迹',
            stopPlay: '停止播放',
            clearFeatures: '清除要素',
            exitDraw: '退出绘制',
            favorites: '收藏夹',
            routePlan: '路线规划'
        },
        infoPanel: {
            title: '属性信息',
            clickFeature: '点击要素查看详细信息',
            noFeature: '未选中任何要素',
            unnamed: '未命名'
        },
        weather: {
            clickAttraction: '点击景点查看天气',
            humidity: '湿度',
            wind: '风速',
            aqi: 'AQI',
            loading: '正在分析空气质量...',
            queryFailed: '查询失败，请稍后重试',
            noData: '暂无数据',
            excellent: '优',
            good: '良',
            moderate: '轻度污染',
            unhealthful: '中度污染',
            veryUnhealthy: '重度污染',
            hazardous: '严重污染',
            airQuality: '空气质量',
            crowd: '人流量',
            pm25: 'PM2.5',
            pm10: 'PM10',
            so2: 'SO₂',
            no2: 'NO₂',
            co: 'CO',
            o3: 'O₃',
            updatedTime: '数据更新时间',
            adviceExcellent: '空气质量良好，适合户外活动',
            adviceGood: '空气质量可接受，敏感人群需注意',
            adviceModerate: '敏感人群应减少户外活动',
            adviceUnhealthful: '所有人应减少户外活动',
            adviceVeryUnhealthy: '避免户外活动，关闭门窗',
            adviceHazardous: '不建议外出',
            crowdComfortable: '舒适',
            crowdModerate: '适中',
            crowdCrowded: '拥挤',
            crowdFull: '爆满',
            crowdAdviceComfortable: '人流较少，适合游览',
            crowdAdviceModerate: '人流一般，适宜出行',
            crowdAdviceCrowded: '人流较多，建议错峰出行',
            crowdAdviceFull: '人流极大，不建议前往',
            none: '无',
            conditionSunny: '晴',
            conditionCloudy: '多云',
            conditionOvercast: '阴',
            conditionRain: '雨',
            conditionSnow: '雪',
            conditionDust: '沙尘',
            conditionFog: '雾',
            windNorth: '北风',
            windSouth: '南风',
            windEast: '东风',
            windWest: '西风',
            windNortheast: '东北风',
            windSoutheast: '东南风',
            windNorthwest: '西北风',
            windSouthwest: '西南风',
            windLevel: '级'
        },
        route: {
            title: '路线规划',
            origin: '起点',
            originPlaceholder: '手动输入地址或从下拉列表选择景点',
            originInput: '手动输入地址',
            selectAttraction: '选择景点',
            destination: '终点',
            selectDestination: '-- 请选择目的地景点 --',
            strategy: '路线方案',
            recommended: '推荐路线（默认）',
            fastest: '最快路线',
            shortest: '最短距离',
            noHighway: '不走高速',
            avoidCongestion: '躲避拥堵',
            leastToll: '收费最少',
            loading: '正在规划路线，请稍候...',
            noRoute: '未找到路线，请尝试其他策略或起点',
            planFailed: '路线规划失败，请检查网络连接',
            close: '关闭',
            plan: '规划路线',
            clear: '清除路线',
            distance: '距离',
            duration: '时间',
            start: '出发',
            end: '到达',
            unknown: '未知',
            kilometers: '公里',
            recommendedBest: '推荐路线（最佳）',
            alternativeSecond: '备选路线（次优）',
            estimatedTime: '预计时间',
            realTimeTraffic: '实时路况：',
            smooth: '畅通',
            slow: '缓行',
            congested: '拥堵',
            severe: '严重拥堵',
            recommendedLabel: '推荐路线',
            alternativeLabel: '备选路线',
            hour: '小时',
            minute: '分钟'
        },
        track: {
            selectTrack: '选择轨迹',
            selectTrackDesc: '选择一个轨迹进行操作',
            noTrack: '暂无轨迹',
            play: '播放',
            delete: '删除',
            cancel: '取消',
            selectAttractions: '选择轨迹景点',
            start: '起点',
            selectStart: '-- 请选择起点 --',
            waypoint: '途经点',
            multiSelect: '(可多选)',
            multiSelectHint: '按住 Ctrl 或 Command 可多选',
            end: '终点',
            selectEnd: '-- 请选择终点 --',
            confirm: '确定',
            trackName: '请输入轨迹名称（留空则不保存）',
            saved: '已保存！',
            savedMsg: '轨迹 "{name}" 已保存！',
            noSaved: '没有已保存的轨迹',
            selectFirst: '请先选择一个轨迹',
            deleted: '轨迹已删除',
            insufficient: '轨迹点不足',
            selectFile: '请选择文件',
            formatError: '文件格式错误'
        },
        favorites: {
            title: '我的收藏',
            empty: '暂无收藏景点',
            remove: '删除',
            viewOnMap: '在地图显示',
            loadingFailed: '加载收藏失败',
            confirmRemove: '确定要取消收藏吗？',
            removed: '已取消收藏',
            addSuccess: '收藏成功！',
            addFailed: '收藏失败',
            removeSuccess: '已取消收藏',
            removeFailed: '取消收藏失败',
            favorited: '已收藏'
        },
        attractions: {
            title: '景点列表',
            history: '历史沿革',
            description: '简介',
            category: '类别',
            address: '地址',
            rating: '评分',
            poetry: '诗词',
            reviews: '游客点评',
            avgRating: '评分',
            noReviews: '暂无用户点评',
            loadFailed: '无法加载点评',
            loadingReviews: '加载点评中...',
            dataSource: '数据来源',
            name: '名称',
            coordinates: '坐标',
            historyLabel: '历史',
            info: '信息',
            favorite: '收藏',
            relatedPoetry: '相关诗词',
            selectedFeatures: '选中了 {count} 个要素',
            type: '类型'
        },
        modal: {
            import: '导入GeoJSON',
            selectFile: '选择文件',
            importBtn: '导入',
            cancel: '取消',
            close: '关闭',
            track: '轨迹管理',
            trackList: '轨迹列表'
        },
        traffic: {
            smooth: '畅行',
            slow: '缓行',
            congested: '拥堵',
            severe: '严重拥堵'
        },
        basemap: {
            gaode: '高德地图',
            satellite: '卫星影像',
            tianditu: '天地图',
            gaodeSatellite: '高德卫星'
        },
        common: {
            confirm: '确定',
            cancel: '取消',
            close: '关闭',
            save: '保存',
            delete: '删除',
            loading: '加载中...',
            error: '请求失败',
            ok: '确定'
        }
    },
};

let currentLang = localStorage.getItem('language') || 'zh-CN';

const pageTitles = {
    'zh-CN': '智游名城—文旅资源推荐与空间分析系统',
};

function t(key) {
    const keys = key.split('.');
    let value = translations[currentLang];
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            value = translations['zh-CN'];
            for (const k2 of keys) {
                if (value && value[k2] !== undefined) {
                    value = value[k2];
                } else {
                    return key;
                }
            }
            return value;
        }
    }
    return value;
}

function changeLanguage(lang) {
    currentLang = lang;
    window.currentLang = lang;
    localStorage.setItem('language', lang);
    document.title = pageTitles[lang] || pageTitles['zh-CN'];
    updateAllTranslations();
}

function updateAllTranslations() {

    const el = document.getElementById('xxx');
    if (el) {
    el.textContent = translations[currentLang].language;
    }
    const navMapTools = document.querySelector('a[data-bs-target="#toolbar"]');
    if (navMapTools) navMapTools.textContent = t('nav.mapTools');
    
    const importLink = document.querySelector('a[data-bs-target="#importModal"]');
    if (importLink) importLink.textContent = t('nav.importGeoJSON');
    
    const exportLink = document.querySelector('a[onclick*="exportGeoJSON"]');
    if (exportLink) exportLink.textContent = t('nav.exportGeoJSON');
    
    updateToolbarTranslations();
    updateModalTranslations();
    updateRouteModalTranslations();
    updateFavoritesTranslations();
    updateWeatherTranslations();
    updateInfoPanelTranslations();
    updateTrackModalsTranslations();
    updateAttractionsPanelTranslations();
    
    if (typeof refreshAttractionsLayer === 'function') {
        refreshAttractionsLayer();
    }
    
    if (typeof populateAttractionsForRoute === 'function') {
        populateAttractionsForRoute();
    }
    
    if (typeof populateTrackModal === 'function') {
        populateTrackModal();
    }
}

function updateToolbarTranslations() {
    const basemapBtn = document.querySelector('button[data-bs-toggle="dropdown"]:nth-of-type(1)');
    if (basemapBtn) basemapBtn.textContent = t('toolbar.switchBasemap');
    
    const basemapItems = document.querySelectorAll('#basemapMenu .dropdown-item');
    if (basemapItems[0]) basemapItems[0].textContent = t('toolbar.gaodeMap');
    if (basemapItems[1]) basemapItems[1].textContent = t('toolbar.esriSatellite');
    if (basemapItems[2]) basemapItems[2].textContent = t('toolbar.gaodeSatellite');
    
    const resetBtn = document.querySelector('button[onclick="resetView()"]');
    if (resetBtn) resetBtn.textContent = t('toolbar.reset');
    
    const queryBtn = document.getElementById('attractionQueryBtn');
    if (queryBtn) queryBtn.textContent = t('toolbar.queryAttraction');
    
    const selectItem = document.querySelector('#attractionsMenu a');
    if (selectItem) selectItem.textContent = t('toolbar.selectAttraction');
    
    const drawButtons = document.querySelectorAll('.btn-outline-success');
    if (drawButtons[0]) drawButtons[0].textContent = t('toolbar.drawPoint');
    if (drawButtons[1]) drawButtons[1].textContent = t('toolbar.drawLine');
    if (drawButtons[2]) drawButtons[2].textContent = t('toolbar.drawPolygon');
    
    const boxSelectBtn = document.querySelector('button[onclick="startBoxSelect()"]');
    if (boxSelectBtn) boxSelectBtn.textContent = t('toolbar.boxSelect');
    
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => {
        const text = btn.textContent;
        if (text.includes('模拟轨迹') || text.includes('軌跡') || text.includes('Track') || text.includes('궤적')) {
            btn.textContent = t('toolbar.simulateTrack');
        }
    });
    
    const playBtn = document.querySelector('button[onclick="playTrack()"]');
    if (playBtn) playBtn.textContent = t('toolbar.playTrack');
    
    const stopBtn = document.querySelector('button[onclick="stopTrackAnimation()"]');
    if (stopBtn) stopBtn.textContent = t('toolbar.stopPlay');
    
    const clearBtn = document.querySelector('button[onclick="clearFeatures()"]');
    if (clearBtn) clearBtn.textContent = t('toolbar.clearFeatures');
    
    const exitBtn = document.querySelector('button[onclick="clearDraw()"]');
    if (exitBtn) exitBtn.textContent = t('toolbar.exitDraw');
    
    const favBtn = document.querySelector('button[onclick="toggleFavoritesPanel()"]');
    if (favBtn) favBtn.textContent = '⭐ ' + t('toolbar.favorites');
    
    const routeBtn = document.querySelector('button[data-bs-target="#routeModal"]');
    if (routeBtn) routeBtn.textContent = t('toolbar.routePlan');
}

function updateModalTranslations() {
    const importModalTitle = document.querySelector('#importModal .modal-title');
    if (importModalTitle) importModalTitle.textContent = t('modal.import');
    
    const importCancelBtn = document.querySelector('#importModal .btn-secondary');
    if (importCancelBtn) importCancelBtn.textContent = t('modal.cancel');
    
    const importBtn = document.querySelector('#importModal .btn-primary');
    if (importBtn) importBtn.textContent = t('modal.importBtn');
    
    const trackListModalTitle = document.querySelector('#trackListModal .modal-title');
    if (trackListModalTitle) trackListModalTitle.textContent = t('track.selectTrack');
    
    const trackModalTitle = document.querySelector('#trackModal .modal-title');
    if (trackModalTitle) trackModalTitle.textContent = t('track.selectAttractions');
}

function updateRouteModalTranslations() {
    const routeModalTitle = document.querySelector('#routeModal .modal-title');
    if (routeModalTitle) routeModalTitle.textContent = t('route.title');
    
    const originLabel = document.querySelector('label[for="routeOrigin"]');
    if (originLabel) originLabel.textContent = t('route.origin') + '（' + t('route.originPlaceholder') + '）';
    
    const originSelectOption = document.querySelector('#routeOriginSelect option');
    if (originSelectOption) originSelectOption.textContent = t('route.selectAttraction');
    
    const destLabel = document.querySelector('label[for="routeDestination"]');
    if (destLabel) destLabel.textContent = t('route.destination');
    
    const destSelectOption = document.querySelector('#routeDestination option');
    if (destSelectOption) destSelectOption.textContent = t('route.selectDestination');
    
    const strategyLabel = document.querySelector('label[for="routeStrategy"]');
    if (strategyLabel) strategyLabel.textContent = t('route.strategy');
    
    const strategyOptions = document.querySelectorAll('#routeStrategy option');
    if (strategyOptions[0]) strategyOptions[0].textContent = t('route.recommended');
    if (strategyOptions[1]) strategyOptions[1].textContent = t('route.fastest');
    if (strategyOptions[2]) strategyOptions[2].textContent = t('route.shortest');
    if (strategyOptions[3]) strategyOptions[3].textContent = t('route.noHighway');
    if (strategyOptions[4]) strategyOptions[4].textContent = t('route.avoidCongestion');
    if (strategyOptions[5]) strategyOptions[5].textContent = t('route.leastToll');
    
    const closeBtn = document.querySelector('#routeModal .btn-secondary');
    if (closeBtn) closeBtn.textContent = t('route.close');
    
    const planBtn = document.querySelector('#routeModal button[onclick="planRoute()"]');
    if (planBtn) planBtn.textContent = t('route.plan');
    
    const clearBtn = document.querySelector('#routeModal button[onclick="clearRoutes()"]');
    if (clearBtn) clearBtn.textContent = t('route.clear');
}

function updateFavoritesTranslations() {
    const favPanelTitle = document.querySelector('#favoritesPanel h5');
    if (favPanelTitle) favPanelTitle.textContent = '⭐ ' + t('favorites.title');
    
    const favPanel = document.getElementById('favoritesPanel');
    if (favPanel && favPanel.style.display !== 'none') {
        loadFavorites();
    }
}

function updateWeatherTranslations() {
    const weatherPanel = document.getElementById('weatherPanel');
    const isPanelVisible = weatherPanel && weatherPanel.style.display !== 'none';
    
    const weatherCondition = document.getElementById('weatherCondition');
    if (weatherCondition && !window.lastWeatherData) {
        weatherCondition.textContent = t('weather.clickAttraction');
    }
    
    if (window.lastWeatherData && isPanelVisible && typeof renderWeather === 'function') {
        renderWeather(window.lastWeatherData);
    }
    
    if (window.lastAirQualityParams && isPanelVisible && typeof queryAirQuality === 'function') {
        const { lon, lat, name } = window.lastAirQualityParams;
        queryAirQuality(lon, lat, name);
    }
}

function updateInfoPanelTranslations() {
    const infoPanelTitle = document.querySelector('#infoPanel h5');
    if (infoPanelTitle) infoPanelTitle.textContent = t('infoPanel.title');
    
    const featureInfo = document.getElementById('featureInfo');
    if (featureInfo) {
        const text = featureInfo.textContent.trim();
        const isDefaultText = text === '点击要素查看详细信息' || 
                            text === '點擊要素查看詳細信息' || 
                            text === 'Click feature for details' ||
                            text === '요소를 클릭하여详细信息 보기' ||
                            text === '地物をクリックして詳細を表示' ||
                            text === '';
        if (isDefaultText) {
            featureInfo.textContent = t('infoPanel.clickFeature');
        } else if (typeof window.currentSelectedFeature !== 'undefined' && window.currentSelectedFeature) {
            // 如果当前选中了景点，重新渲染信息面板
            const props = window.currentSelectedFeature.getProperties();
            const geom = window.currentSelectedFeature.getGeometry();
            const coords = geom.getCoordinates();
            
            let html = '<div class="popup-content">';
            
            if (props.name) {
                const attractionId = props.name;
                const attractionName = typeof getGeoJSONFeatureName === 'function' ? getGeoJSONFeatureName(props) : (props.name || '');
                html += `<div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0;">${attractionName}</h4>
                    <button id="favoriteBtn" class="btn btn-sm" style="padding: 4px 12px; font-size: 0.8rem;" onclick="toggleFavorite('${attractionId.replace(/'/g, "\\'")}')">
                        ⭐ ${t('attractions.favorite')}
                    </button>
                </div>`;
            }
            
            const displayProps = ['description', 'category', 'address', 'rating', 'history', 'poetry'];
            displayProps.forEach(key => {
                if (props[key]) {
                    if (key === 'rating') {
                        html += `<p><span class="label">${t('attractions.rating')}:</span> ${'★'.repeat(props[key])}</p>`;
                    } else if (key === 'poetry') {
                        html += `<div class="poetry-section"><p><span class="label">📜 ${t('attractions.relatedPoetry')}:</span></p><pre style="white-space: pre-wrap; font-family: 'Noto Serif SC', serif; font-size: 0.85rem; color: #5c3d2e; background: rgba(201, 162, 39, 0.1); padding: 10px; border-radius: 4px; border-left: 3px solid #c9a227;">${props[key]}</pre></div>`;
                    } else if (key === 'history') {
                        html += `<p><span class="label">📖 ${t('attractions.history')}:</span></p><p style="text-indent: 2em; line-height: 1.7;">${props[key]}</p>`;
                    } else if (typeof getLabel === 'function') {
                        html += `<p><span class="label">${getLabel(key)}:</span> ${props[key]}</p>`;
                    }
                }
            });
            
            html += '</div>';
            featureInfo.innerHTML = html;
            
            // 重新加载点评（使用新语言）
            if (props.name && typeof loadReviews === 'function') {
                loadReviews(props.name, coords);
            }
        }
    }
}

function updateTrackModalsTranslations() {
    const trackSelectDesc = document.querySelector('#trackListModal .text-muted');
    if (trackSelectDesc) trackSelectDesc.textContent = t('track.selectTrackDesc');
    
    const trackPlayBtn = document.querySelector('#trackActionButtons .btn-primary');
    if (trackPlayBtn) trackPlayBtn.textContent = '▶ ' + t('track.play');
    
    const trackDeleteBtn = document.querySelector('#trackActionButtons .btn-danger');
    if (trackDeleteBtn) trackDeleteBtn.textContent = '🗑️ ' + t('track.delete');
    
    const trackCancelBtn = document.querySelector('#trackActionButtons .btn-secondary');
    if (trackCancelBtn) trackCancelBtn.textContent = t('track.cancel');
    
    const startLabel = document.querySelector('label[for="trackOrigin"]');
    if (startLabel) startLabel.textContent = '🚩 ' + t('track.start');
    
    const waypointLabel = document.querySelector('label[for="trackWaypoints"]');
    if (waypointLabel) waypointLabel.innerHTML = '📍 ' + t('track.waypoint') + ' <span class="text-muted fw-normal">' + t('track.multiSelect') + '</span>';
    
    const waypointHint = document.querySelector('#trackWaypoints + small');
    if (waypointHint) waypointHint.textContent = t('track.multiSelectHint');
    
    const endLabel = document.querySelector('label[for="trackDestination"]');
    if (endLabel) endLabel.textContent = '🏁 ' + t('track.end');
    
    const trackConfirmBtn = document.querySelector('#trackModal .btn-primary');
    if (trackConfirmBtn) trackConfirmBtn.textContent = t('track.confirm');
    
    const trackCancelBtn2 = document.querySelector('#trackModal .btn-secondary');
    if (trackCancelBtn2) trackCancelBtn2.textContent = t('track.cancel');
}

function updateAttractionsPanelTranslations() {
    const attractionsTitle = document.querySelector('#attractionsList h5');
    if (attractionsTitle) attractionsTitle.textContent = t('attractions.title');
}
