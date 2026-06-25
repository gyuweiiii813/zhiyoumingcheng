const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const PORT = process.env.PORT || 8080;

const AMAP_KEY = '172d909ad5d87f9e74cf916da65feddb';

// 豆包 AI 配置
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com';
const ARK_MODEL = process.env.ARK_MODEL;

const db = new sqlite3.Database('favorites.db');

db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attraction_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        address TEXT,
        rating INTEGER,
        history TEXT,
        poetry TEXT,
        coordinates TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function generateAirQuality(lon, lat) {
    const aqi = Math.floor(Math.random() * 150) + 30;
    const pm25 = Math.floor(Math.random() * 80) + 10;
    const pm10 = Math.floor(Math.random() * 100) + 20;
    const so2 = Math.floor(Math.random() * 20) + 1;
    const no2 = Math.floor(Math.random() * 60) + 10;
    const co = (Math.random() * 2 + 0.3).toFixed(1);
    const o3 = Math.floor(Math.random() * 100) + 20;
    
    let level, color, advice;
    if (aqi <= 50) {
        level = '优';
        color = '#00e400';
        advice = '空气质量良好，适合户外活动';
    } else if (aqi <= 100) {
        level = '良';
        color = '#ffff00';
        advice = '空气质量可接受，敏感人群需注意';
    } else if (aqi <= 150) {
        level = '轻度污染';
        color = '#ff7e00';
        advice = '敏感人群应减少户外活动';
    } else if (aqi <= 200) {
        level = '中度污染';
        color = '#ff0000';
        advice = '所有人应减少户外活动';
    } else {
        level = '重度污染';
        color = '#99004c';
        advice = '避免户外活动，关闭门窗';
    }
    
    const pollutants = [];
    if (pm25 > 75) pollutants.push('PM2.5');
    if (pm10 > 150) pollutants.push('PM10');
    if (so2 > 60) pollutants.push('SO₂');
    if (no2 > 80) pollutants.push('NO₂');
    if (co > 4) pollutants.push('CO');
    if (o3 > 180) pollutants.push('O₃');
    
    const crowdLevel = Math.floor(Math.random() * 100);
    let crowdStatus, crowdColor, crowdAdvice;
    if (crowdLevel <= 30) {
        crowdStatus = '舒适';
        crowdColor = '#27ae60';
        crowdAdvice = '人流较少，适合游览';
    } else if (crowdLevel <= 60) {
        crowdStatus = '适中';
        crowdColor = '#f39c12';
        crowdAdvice = '人流一般，适宜出行';
    } else if (crowdLevel <= 85) {
        crowdStatus = '拥挤';
        crowdColor = '#e74c3c';
        crowdAdvice = '人流较多，建议错峰出行';
    } else {
        crowdStatus = '爆满';
        crowdColor = '#8e44ad';
        crowdAdvice = '人流极大，不建议前往';
    }
    
    return {
        aqi,
        level,
        color,
        advice,
        pollutants: pollutants.length > 0 ? pollutants : ['无'],
        pm25,
        pm10,
        so2,
        no2,
        co,
        o3,
        crowdLevel,
        crowdStatus,
        crowdColor,
        crowdAdvice,
        timestamp: new Date().toISOString()
    };
}

function generateMockReviews(attractionName, lang = 'zh-CN') {
    const reviewTemplatesByLang = {
        'zh-CN': {
            templates: [
                { content: "景色非常美，值得一去！特别是历史底蕴深厚", rating: 5 },
                { content: "门票有点贵，但景点确实很棒", rating: 4 },
                { content: "人太多了，建议工作日去", rating: 3 },
                { content: "非常适合拍照，建筑风格独特", rating: 5 },
                { content: "讲解很详细，学到了很多知识", rating: 5 },
                { content: "带孩子来的，孩子很喜欢", rating: 4 },
                { content: "环境优美，设施完善", rating: 4 },
                { content: "交通便利，推荐乘坐地铁前往", rating: 4 },
                { content: "节假日人山人海，建议避开高峰期", rating: 3 },
                { content: "文化氛围浓厚，不虚此行", rating: 5 }
            ],
            userNames: [
                "旅游爱好者", "历史迷", "摄影达人", "亲子游", 
                "文化探索者", "周末休闲客", "城市行者", "古迹寻访者"
            ]
        },
        'en': {
            templates: [
                { content: "Beautiful scenery! Worth visiting, especially rich in historical heritage", rating: 5 },
                { content: "Tickets are a bit expensive, but the attraction is really great", rating: 4 },
                { content: "Too crowded, recommend visiting on weekdays", rating: 3 },
                { content: "Perfect for photography, unique architectural style", rating: 5 },
                { content: "Very detailed tour guide, learned a lot", rating: 5 },
                { content: "Came with kids, they loved it", rating: 4 },
                { content: "Beautiful environment, well-equipped facilities", rating: 4 },
                { content: "Convenient transportation, recommend taking metro", rating: 4 },
                { content: "Very crowded on holidays, recommend avoiding peak times", rating: 3 },
                { content: "Strong cultural atmosphere, worth the trip", rating: 5 }
            ],
            userNames: [
                "Travel Enthusiast", "History Buff", "Photography Fan", "Family Traveler",
                "Cultural Explorer", "Weekend Visitor", "City Walker", "Heritage Hunter"
            ]
        },
        'zh-TW': {
            templates: [
                { content: "景色非常美，值得一去！特別是歷史底蘊深厚", rating: 5 },
                { content: "門票有點貴，但景點確實很棒", rating: 4 },
                { content: "人太多了，建議工作日去", rating: 3 },
                { content: "非常適合拍照，建築風格獨特", rating: 5 },
                { content: "講解很詳細，學到了很多知識", rating: 5 },
                { content: "帶孩子來的，孩子很喜歡", rating: 4 },
                { content: "環境優美，設施完善", rating: 4 },
                { content: "交通便利，推薦乘坐地鐵前往", rating: 4 },
                { content: "節假日人山人海，建議避開高峰期", rating: 3 },
                { content: "文化氛圍濃厚，不虛此行", rating: 5 }
            ],
            userNames: [
                "旅遊愛好者", "歷史迷", "攝影達人", "親子遊", 
                "文化探索者", "週末休閒客", "城市行者", "古蹟尋訪者"
            ]
        },
        'ja': {
            templates: [
                { content: "景色が非常に美しく、訪れる価値あり！特に歴史的な背景が豊かです", rating: 5 },
                { content: "チケットは少し高いですが、観光地は本当に素晴らしい", rating: 4 },
                { content: "人が多すぎるので、平日に行くことをお勧めします", rating: 3 },
                { content: "写真撮影に最適で、独特な建築スタイルです", rating: 5 },
                { content: "詳しいガイドで、多くの知識を学びました", rating: 5 },
                { content: "子どもを連れてきましたが、子どもたちはとても好きでした", rating: 4 },
                { content: "美しい環境で、設備も充実しています", rating: 4 },
                { content: "交通が便利で、地下鉄での移動をお勧めします", rating: 4 },
                { content: "休日は非常に混雑するので、ピークタイムを避けることをお勧めします", rating: 3 },
                { content: "文化的な雰囲気が濃く、来て良かったです", rating: 5 }
            ],
            userNames: [
                "旅行愛好家", "歴史マニア", "写真家", "家族旅行",
                "文化探究者", "週末観光客", "都市歩行者", "文化遺産ハンター"
            ]
        },
        'ko': {
            templates: [
                { content: "풍경이 매우 아름다워서 방문할 가치가 있어요! 특히 역사적 배경이 풍부합니다", rating: 5 },
                { content: "티켓이 조금 비싸지만 관광지가 정말 훌륭해요", rating: 4 },
                { content: "사람이 너무 많아서 평일에 가는 것을 권장해요", rating: 3 },
                { content: "사진 찍기에 완벽하고 독특한 건축 스타일이에요", rating: 5 },
                { content: "자세한 가이드로 많은 지식을 배웠어요", rating: 5 },
                { content: "아이와 함께 왔는데 아이들이 정말 좋아했어요", rating: 4 },
                { content: "아름다운 환경이고 시설도 완벽해요", rating: 4 },
                { content: "교통이 편리해서 지하철로 가는 것을 권장해요", rating: 4 },
                { content: "휴일은 매우 붐비니 피크타임을 피하는 것을 권장해요", rating: 3 },
                { content: "문화적 분위기가 풍부해서 오길 잘 했어요", rating: 5 }
            ],
            userNames: [
                "여행 애호가", "역사 매니아", "사진가", "가족 여행자",
                "문화 탐구자", "주말 관광객", "도시 보행자", "문화 유산 탐험가"
            ]
        }
    };
    
    const langData = reviewTemplatesByLang[lang] || reviewTemplatesByLang['zh-CN'];
    const reviewTemplates = langData.templates;
    const userNames = langData.userNames;
    
    const shuffled = reviewTemplates.sort(() => 0.5 - Math.random());
    const count = Math.min(5, shuffled.length);
    
    return shuffled.slice(0, count).map((template, index) => ({
        id: index + 1,
        user: userNames[Math.floor(Math.random() * userNames.length)],
        content: template.content,
        rating: template.rating,
        date: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }));
}

const server = http.createServer((req, res) => {
    try {
                const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, corsHeaders);
            res.end();
            return;
        }
                // AI 智能问答接口
        if (req.url.startsWith('/api/chat')) {
            if (req.method !== 'POST') {
                res.writeHead(405, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({
                    success: false,
                    error: '只支持 POST 请求'
                }));
                return;
            }

            let body = '';

            req.on('data', chunk => {
                body += chunk;
            });

            req.on('end', () => {
                let requestData = {};

                try {
                    requestData = JSON.parse(body || '{}');
                } catch (e) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({
                        success: false,
                        error: '请求内容不是 JSON'
                    }));
                    return;
                }

                const message = requestData.message || '';

                if (!message.trim()) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({
                        success: false,
                        error: '请输入问题'
                    }));
                    return;
                }

                if (!ARK_API_KEY || !ARK_MODEL) {
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({
                        success: false,
                        error: '没有配置 ARK_API_KEY 或 ARK_MODEL，请检查 .env 文件'
                    }));
                    return;
                }

                const postData = JSON.stringify({
                    model: ARK_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: '你是“智游名城”文旅系统的 AI 助手，擅长景点推荐、路线规划、空间分析结果解读，请用简洁中文回答。'
                        },
                        {
                            role: 'user',
                            content: message
                        }
                    ],
                    max_tokens: 800,
                    temperature: 0.7
                });

                const options = {
                    hostname: 'ark.cn-beijing.volces.com',
                    path: '/api/v3/chat/completions',
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + ARK_API_KEY,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const aiReq = https.request(options, aiRes => {
                    let aiData = '';

                    aiRes.on('data', chunk => {
                        aiData += chunk;
                    });

                    aiRes.on('end', () => {
                        try {
                            const result = JSON.parse(aiData);

                            const answer =
                                result.choices &&
                                result.choices[0] &&
                                result.choices[0].message
                                    ? result.choices[0].message.content
                                    : 'AI 没有返回有效内容。';

                            res.writeHead(200, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*'
                            });

                            res.end(JSON.stringify({
                                success: true,
                                answer: answer,
                                data: result
                            }));
                        } catch (e) {
                            res.writeHead(500, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*'
                            });

                            res.end(JSON.stringify({
                                success: false,
                                error: 'AI 返回解析失败',
                                raw: aiData
                            }));
                        }
                    });
                });

                aiReq.on('error', err => {
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });

                    res.end(JSON.stringify({
                        success: false,
                        error: 'AI 请求失败：' + err.message
                    }));
                });

                aiReq.write(postData);
                aiReq.end();
            });

            return;
        }
        if (req.url.startsWith('/api/airquality')) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const lon = parseFloat(url.searchParams.get('lon'));
            const lat = parseFloat(url.searchParams.get('lat'));
            
            if (isNaN(lon) || isNaN(lat)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid coordinates' }));
                return;
            }
            
            function getAirQuality(lon, lat) {
                return new Promise((resolve, reject) => {
                    const geoPath = `/v3/geocode/geo?location=${lon},${lat}&key=${AMAP_KEY}`;
                    const geoOptions = {
                        hostname: 'restapi.amap.com',
                        path: geoPath,
                        method: 'GET',
                        timeout: 10000
                    };
                    
                    const geoReq = http.request(geoOptions, (geoRes) => {
                        let geoData = '';
                        geoRes.on('data', (chunk) => { geoData += chunk; });
                        geoRes.on('end', () => {
                            try {
                                const geoResult = JSON.parse(geoData);
                                if (geoResult.status === '1' && geoResult.geocodes && geoResult.geocodes.length > 0) {
                                    const cityCode = geoResult.geocodes[0].citycode;
                                    
                                    const aqiPath = `/v3/weather/utf8/air/${cityCode}?key=${AMAP_KEY}`;
                                    const aqiOptions = {
                                        hostname: 'restapi.amap.com',
                                        path: aqiPath,
                                        method: 'GET',
                                        timeout: 10000
                                    };
                                    
                                    const aqiReq = http.request(aqiOptions, (aqiRes) => {
                                        let aqiData = '';
                                        aqiRes.on('data', (chunk) => { aqiData += chunk; });
                                        aqiRes.on('end', () => {
                                            try {
                                                const aqiResult = JSON.parse(aqiData);
                                                if (aqiResult.status === '1' && aqiResult.lives && aqiResult.lives.length > 0) {
                                                    const air = aqiResult.lives[0];
                                                    resolve({
                                                        aqi: parseInt(air.aqi),
                                                        level: air.level,
                                                        color: getAqiColor(air.level),
                                                        advice: getAqiAdvice(air.level),
                                                        pollutants: [air.primary],
                                                        pm25: Math.floor(Math.random() * 50) + 10,
                                                        pm10: Math.floor(Math.random() * 80) + 20,
                                                        so2: Math.floor(Math.random() * 20) + 1,
                                                        no2: Math.floor(Math.random() * 40) + 10,
                                                        co: (Math.random() * 2 + 0.3).toFixed(1),
                                                        o3: Math.floor(Math.random() * 80) + 20,
                                                        crowdLevel: Math.floor(Math.random() * 100),
                                                        crowdStatus: getCrowdStatus(Math.floor(Math.random() * 100)),
                                                        crowdColor: '#27ae60',
                                                        crowdAdvice: '人流数据获取中',
                                                        timestamp: new Date().toISOString()
                                                    });
                                                } else {
                                                    reject(new Error('No air quality data'));
                                                }
                                            } catch (e) {
                                                reject(e);
                                            }
                                        });
                                    });
                                    
                                    aqiReq.on('error', (e) => reject(e));
                                    aqiReq.on('timeout', () => { aqiReq.destroy(); reject(new Error('timeout')); });
                                    aqiReq.end();
                                } else {
                                    reject(new Error('Geocode failed'));
                                }
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });
                    
                    geoReq.on('error', (e) => reject(e));
                    geoReq.on('timeout', () => { geoReq.destroy(); reject(new Error('timeout')); });
                    geoReq.end();
                });
            }
            
            function getAqiColor(level) {
                const colors = { '优': '#00e400', '良': '#ffff00', '轻度污染': '#ff7e00', '中度污染': '#ff0000', '重度污染': '#99004c', '严重污染': '#7e0023' };
                return colors[level] || '#00e400';
            }
            
            function getAqiAdvice(level) {
                const advice = { '优': '空气质量良好，适合户外活动', '良': '空气质量可接受，敏感人群需注意', '轻度污染': '敏感人群应减少户外活动', '中度污染': '所有人应减少户外活动', '重度污染': '避免户外活动，关闭门窗', '严重污染': '不建议外出' };
                return advice[level] || '注意空气质量';
            }
            
            function getCrowdStatus(level) {
                if (level <= 30) return '舒适';
                if (level <= 60) return '适中';
                if (level <= 85) return '拥挤';
                return '爆满';
            }
            
            getAirQuality(lon, lat)
                .then(airQuality => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(airQuality));
                })
                .catch(err => {
                    const airQuality = generateAirQuality(lon, lat);
                    airQuality.source = 'demo';
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(airQuality));
                });
            return;
        }
        
        if (req.url.startsWith('/api/weather')) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const lon = parseFloat(url.searchParams.get('lon'));
            const lat = parseFloat(url.searchParams.get('lat'));
            
            function getRealWeather(lon, lat) {
                return new Promise((resolve, reject) => {
                    const weatherPath = `/v3/weather/geo.json?key=${AMAP_KEY}&location=${lon},${lat}`;
                    const weatherOptions = {
                        hostname: 'restapi.amap.com',
                        path: weatherPath,
                        method: 'GET',
                        timeout: 10000
                    };
                    
                    const req = http.request(weatherOptions, (response) => {
                        let data = '';
                        response.on('data', (chunk) => { data += chunk; });
                        response.on('end', () => {
                            try {
                                const result = JSON.parse(data);
                                if (result.status === '1' && result.lives && result.lives.length > 0) {
                                    const live = result.lives[0];
                                    const weatherMap = {
                                        '晴': '☀️', '多云': '⛅', '阴': '☁️', '小雨': '🌧️',
                                        '中雨': '🌧️', '大雨': '⛈️', '雷阵雨': '⛈️', '晴转多云': '🌤️',
                                        '多云转晴': '🌤️', '小雪': '🌨️', '中雪': '❄️', '大雪': '❄️'
                                    };
                                    resolve({
                                        condition: live.weather,
                                        icon: weatherMap[live.weather] || '🌤️',
                                        temp: parseInt(live.temperature),
                                        humidity: parseInt(live.humidity),
                                        windSpeed: parseInt(live.windpower),
                                        windDir: live.winddirection,
                                        aqi: 0,
                                        timestamp: new Date().toISOString()
                                    });
                                } else {
                                    reject(new Error('Weather API failed'));
                                }
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });
                    
                    req.on('error', (e) => reject(e));
                    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                    req.end();
                });
            }
            
            getRealWeather(lon, lat)
                .then(weather => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(weather));
                })
                .catch(err => {
                    const weatherConditions = [
                        { text: '晴', icon: '☀️', temp: [15, 32] },
                        { text: '多云', icon: '⛅', temp: [18, 28] },
                        { text: '阴', icon: '☁️', temp: [20, 26] },
                        { text: '小雨', icon: '🌧️', temp: [18, 24] }
                    ];
                    
                    let baseTemp = 25;
                    if (lat > 40) baseTemp = 18;
                    else if (lat > 35) baseTemp = 22;
                    else if (lat > 25) baseTemp = 26;
                    
                    const condition = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
                    const temp = Math.floor(Math.random() * (condition.temp[1] - condition.temp[0]) + condition.temp[0] + (baseTemp - 25));
                    
                    const weather = {
                        condition: condition.text,
                        icon: condition.icon,
                        temp,
                        humidity: Math.floor(Math.random() * 40) + 40,
                        windSpeed: Math.floor(Math.random() * 20) + 5,
                        windDir: ['北风', '东北风', '东风', '东南风', '南风'][Math.floor(Math.random() * 5)],
                        aqi: Math.floor(Math.random() * 80) + 20,
                        timestamp: new Date().toISOString(),
                        source: 'demo'
                    };
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(weather));
                });
            return;
        }
        
        if (req.url.startsWith('/api/route')) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const origin = url.searchParams.get('origin');
            const destination = url.searchParams.get('destination');
            const waypoints = url.searchParams.get('waypoints');
            const strategy = url.searchParams.get('strategy') || '0';
            const traffic = url.searchParams.get('traffic') || '1';
            
            if (!origin || !destination) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing origin or destination' }));
                return;
            }
            
            console.log(`Route request: origin=${origin}, destination=${destination}, waypoints=${waypoints}, strategy=${strategy}, traffic=${traffic}`);
            
            function getRoute(originCoord, destCoord, waypointsParam, callback) {
                let path = `/v3/direction/driving?origin=${originCoord}&destination=${destCoord}&strategy=${strategy}&key=${AMAP_KEY}&traffic=1`;
                if (waypointsParam) {
                    path += `&waypoints=${waypointsParam}`;
                }
                
                const requestOptions = {
                    hostname: 'restapi.amap.com',
                    path: path,
                    method: 'GET',
                    timeout: 15000
                };
                
                const amapReq = http.request(requestOptions, (response) => {
                    let data = '';
                    response.on('data', (chunk) => { data += chunk; });
                    response.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            callback(result);
                        } catch (e) {
                            console.error('Parse error:', e.message);
                            callback({ error: 'Failed to parse response' });
                        }
                    });
                });
                
                amapReq.on('error', (e) => {
                    console.error('AMAP API error:', e.message);
                    callback({ error: 'Route planning service unavailable' });
                });
                
                amapReq.on('timeout', () => {
                    console.error('AMAP API timeout');
                    amapReq.destroy();
                    callback({ error: 'Route planning timeout' });
                });
                
                amapReq.end();
            }
            
            const isCoord = (str) => /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(str);
            
            if (isCoord(origin)) {
                getRoute(origin, destination, waypoints, (result) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                });
            } else {
                const geocodePath = `/v3/geocode/geo?address=${encodeURIComponent(origin)}&key=${AMAP_KEY}`;
                console.log(`Geocoding address: ${origin}`);
                
                const geocodeReq = http.request({
                    hostname: 'restapi.amap.com',
                    path: geocodePath,
                    method: 'GET',
                    timeout: 10000
                }, (response) => {
                    let data = '';
                    response.on('data', (chunk) => { data += chunk; });
                    response.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            if (result.status === '1' && result.geocodes && result.geocodes.length > 0) {
                                const location = result.geocodes[0].location;
                                console.log(`Geocode result: ${location}`);
                                getRoute(location, destination, waypoints, (routeResult) => {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify(routeResult));
                                });
                            } else {
                                console.error('Geocode failed:', result.info);
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: '无法解析起点地址' }));
                            }
                        } catch (e) {
                            console.error('Geocode parse error:', e.message);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: '地址解析失败' }));
                        }
                    });
                });
                
                geocodeReq.on('error', (e) => {
                    console.error('Geocode API error:', e.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '地址解析服务不可用' }));
                });
                
                geocodeReq.on('timeout', () => {
                    console.error('Geocode API timeout');
                    geocodeReq.destroy();
                    res.writeHead(504, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '地址解析超时' }));
                });
                
                geocodeReq.end();
            }
            return;
        }
        
        if (req.url.startsWith('/api/favorites')) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            
            if (req.method === 'GET') {
                db.all('SELECT * FROM favorites ORDER BY created_at DESC', [], (err, favorites) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(favorites));
                    }
                });
                return;
            }
            
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        db.run(`
                            INSERT OR REPLACE INTO favorites 
                            (attraction_id, name, description, category, address, rating, history, poetry, coordinates)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            data.attraction_id,
                            data.name,
                            data.description || null,
                            data.category || null,
                            data.address || null,
                            data.rating || null,
                            data.history || null,
                            data.poetry || null,
                            data.coordinates || null
                        ], function(err) {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: err.message }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true }));
                            }
                        });
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }
            
            if (req.method === 'DELETE') {
                const attractionId = url.searchParams.get('attraction_id');
                if (!attractionId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing attraction_id' }));
                    return;
                }
                db.run('DELETE FROM favorites WHERE attraction_id = ?', [attractionId], function(err) {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    }
                });
                return;
            }
        }
        
        if (req.url.startsWith('/api/favorites/check')) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const attractionId = url.searchParams.get('attraction_id');
            db.get('SELECT * FROM favorites WHERE attraction_id = ?', [attractionId], (err, favorite) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ isFavorite: !!favorite }));
                }
            });
            return;
        }
        
        if (req.url.startsWith('/api/poi/detail')) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const name = url.searchParams.get('name');
            const location = url.searchParams.get('location');
            const lang = url.searchParams.get('lang') || 'zh-CN';
            
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing name parameter' }));
                return;
            }
            
            function getPOIDetail(name, location) {
                return new Promise((resolve, reject) => {
                    const poiOptions = {
                        hostname: 'restapi.amap.com',
                        path: `/v3/place/detail?keywords=${encodeURIComponent(name)}&key=${AMAP_KEY}&types=${encodeURIComponent('风景名胜|旅游景点')}&city=beijing&output=json`,
                        method: 'GET',
                        timeout: 10000
                    };
                    
                    const poiReq = http.request(poiOptions, (response) => {
                        let data = '';
                        response.on('data', (chunk) => { data += chunk; });
                        response.on('end', () => {
                            try {
                                const result = JSON.parse(data);
                                resolve(result);
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });
                    
                    poiReq.on('error', (e) => {
                        reject(e);
                    });
                    
                    poiReq.on('timeout', () => {
                        poiReq.destroy();
                        reject(new Error('timeout'));
                    });
                    
                    poiReq.end();
                });
            }
            
            getPOIDetail(name, location)
                .then(poiData => {
                    const mockReviews = generateMockReviews(name, lang);
                    const reviews = {
                        poiInfo: poiData,
                        reviews: mockReviews,
                        total: mockReviews.length,
                        avgRating: (mockReviews.reduce((sum, r) => sum + r.rating, 0) / mockReviews.length).toFixed(1)
                    };
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(reviews));
                })
                .catch(err => {
                    const mockReviews = generateMockReviews(name, lang);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        reviews: mockReviews,
                        total: mockReviews.length,
                        avgRating: (mockReviews.reduce((sum, r) => sum + r.rating, 0) / mockReviews.length).toFixed(1),
                        source: 'demo'
                    }));
                });
            return;
        }
        
        let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
        
        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('404 Not Found', 'utf-8');
                } else {
                    res.writeHead(500);
                    res.end('Server Error: ' + err.code, 'utf-8');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    } catch (e) {
        console.error('Server error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
});

server.on('error', (e) => {
    console.error('Server error:', e.message);
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});