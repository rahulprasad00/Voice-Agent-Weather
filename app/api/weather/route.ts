// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Same helper as before, just with types.
const formatTimeLabel = (timeIntent?: string) => {
    switch (timeIntent) {
        case 'tomorrow':
            return 'tomorrow';
        case 'tonight':
            return 'tonight';
        case 'today':
            return 'today';
        case 'now':
        default:
            return 'right now';
    }
};

const buildMessage = (params: {
    city: string;
    metric: string;
    timeIntent: string;
    temperature: number;
    feelsLike: number;
    description: string;
    humidity?: number | null;
    windSpeed?: number | null;
    rainChance?: number | null;
    rainVolume?: number | null;
}) => {
    const timeLabel = formatTimeLabel(params.timeIntent);

    if (params.metric === 'temperature') {
        return `The temperature in ${params.city} ${timeLabel} is ${params.temperature}°C and it feels like ${params.feelsLike}°C.`;
    }

    if (params.metric === 'rain') {
        if (params.rainChance != null) {
            const volumeText = params.rainVolume ? ` with about ${params.rainVolume}mm expected` : '';
            return `In ${params.city} ${timeLabel}, the chance of rain is ${Math.round(
                params.rainChance,
            )}%${volumeText}.`;
        }
        return `I couldn't find a rain forecast for ${params.city} ${timeLabel}, but current conditions are ${params.description}.`;
    }

    if (params.metric === 'humidity') {
        return `The humidity in ${params.city} ${timeLabel} is ${params.humidity}% with conditions ${params.description}.`;
    }

    if (params.metric === 'wind') {
        return `The wind in ${params.city} ${timeLabel} is blowing at ${params.windSpeed} m/s with ${params.description}.`;
    }

    return `The weather in ${params.city} ${timeLabel} is ${params.description} with a temperature of ${params.temperature}°C, feeling like ${params.feelsLike}°C.`;
};

const selectForecastSlice = (list: any[], timeIntent: string) => {
    const now = new Date();
    const target = new Date(now);

    if (timeIntent === 'tomorrow') {
        // Aim at tomorrow midday.
        target.setDate(target.getDate() + 1);
        target.setHours(12, 0, 0, 0);
    } else if (timeIntent === 'tonight') {
        // Aim at tonight (evening hours).
        target.setHours(21, 0, 0, 0);
    } else {
        // Default to current hour.
        target.setHours(now.getHours(), 0, 0, 0);
    }

    const targetDay = target.toISOString().slice(0, 10);

    const candidates = list.filter((item) => {
        const itemDate = new Date(item.dt * 1000);
        const itemDay = itemDate.toISOString().slice(0, 10);

        if (timeIntent === 'tomorrow' || timeIntent === 'today') {
            // Keep entries that match the target calendar day.
            return itemDay === targetDay;
        }
        if (timeIntent === 'tonight') {
            // Same day, but only evening slots.
            return itemDay === targetDay && itemDate.getHours() >= 18;
        }
        // No time filter: accept all.
        return true;
    });

    // If filtering produced results, use them; otherwise fall back to the full forecast list.
    const pool = candidates.length ? candidates : list;

    return pool.reduce((closest: any, item: any) => {
        const itemDate = new Date(item.dt * 1000);
        const diff = Math.abs(itemDate.getTime() - target.getTime());
        if (!closest) return item;
        const closestDiff = Math.abs(new Date(closest.dt * 1000).getTime() - target.getTime());
        // Retain the entry closest to the target timestamp.
        return diff < closestDiff ? item : closest;
    }, null as any);
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { city, timeIntent, metric } = body || {};

        if (!OPENWEATHER_API_KEY) {
            return NextResponse.json(
                { error: 'OpenWeather API key not configured on the server.' },
                { status: 500 },
            );
        }

        if (!city) {
            return NextResponse.json({ error: 'City parameter is required' }, { status: 400 });
        }

        const desiredMetric: string = metric || 'general';
        const desiredTime: string = timeIntent || 'now';

        if (desiredTime === 'yesterday') {
            return NextResponse.json(
                { error: 'Sorry, I cannot fetch weather for the past.' },
                { status: 400 },
            );
        }

        let weatherData: any = null;
        let cityName: string = city;

        if (desiredTime === 'tomorrow' || desiredTime === 'tonight') {
            // Use forecast API for future/tonight queries.
            const forecastResp = await fetch(
                `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
                    city,
                )}&appid=${OPENWEATHER_API_KEY}&units=metric`,
            );

            if (!forecastResp.ok) {
                const bodyText = await forecastResp.text();
                if (forecastResp.status === 404) {
                    return NextResponse.json(
                        {
                            error: `Forecast not available for "${city}".${bodyText}`,
                        },
                        { status: 404 },
                    );
                }
                throw new Error(`Forecast API error: ${forecastResp.status} ${bodyText}`);
            }

            const forecastData = await forecastResp.json();
            // Prefer canonical city name from API response.
            cityName = forecastData.city?.name || city;
            // Pick the forecast entry closest to the requested time.
            weatherData = selectForecastSlice(forecastData.list, desiredTime);
        } else {
            // Use current weather API for present-day queries.
            const encodedCity = encodeURIComponent(city);
            console.log(encodedCity);
            const response = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${OPENWEATHER_API_KEY}&units=metric`,
            );

            if (!response.ok) {
                const bodyText = await response.text();
                if (response.status === 404) {
                    return NextResponse.json(
                        { error: `City "${city}" not found. ${bodyText}` },
                        { status: 404 },
                    );
                }
                throw new Error(`Weather API error: ${response.status} ${bodyText}`);
            }

            weatherData = await response.json();
            cityName = weatherData.name || city;
        }

        if (!weatherData) {
            throw new Error('Could not retrieve weather data');
        }

        const normalized =
            desiredTime === 'tomorrow' || desiredTime === 'tonight'
                ? {
                    description: weatherData.weather?.[0]?.description,
                    temperature: Math.round(weatherData.main?.temp),
                    feelsLike: Math.round(weatherData.main?.feels_like),
                    humidity: weatherData.main?.humidity,
                    windSpeed: weatherData.wind?.speed,
                    rainChance:
                        typeof weatherData.pop === 'number' ? Math.round(weatherData.pop * 100) : null,
                    rainVolume: weatherData.rain?.['3h'] ?? weatherData.rain?.['1h'] ?? null,
                }
                : {
                    description: weatherData.weather?.[0]?.description,
                    temperature: Math.round(weatherData.main?.temp),
                    feelsLike: Math.round(weatherData.main?.feels_like),
                    humidity: weatherData.main?.humidity,
                    windSpeed: weatherData.wind?.speed,
                    rainChance: weatherData.rain ? 100 : null,
                    rainVolume: weatherData.rain?.['1h'] ?? weatherData.rain?.['3h'] ?? null,
                };

        const message = buildMessage({
            city: cityName,
            metric: desiredMetric,
            timeIntent: desiredTime,
            ...normalized,
        });

        return NextResponse.json({
            city: cityName,
            ...normalized,
            metric: desiredMetric,
            timeIntent: desiredTime,
            message,
        });
    } catch (error: unknown) {
        console.error('Error fetching weather:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
