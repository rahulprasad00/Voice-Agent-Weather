'use client';

import { useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const VoiceAgent = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { toast } = useToast();

  // Pull out a city name while stripping filler/time/weather words.
  const extractCity = (text: string): string | null => {
    const normalizedText = text.toLowerCase();

    // Broader patterns to catch different ways people ask about weather.
    const patterns = [
      // weather in/of/at/for X
      /\b(?:weather|temperature|forecast)\s*(?:in|at|for|of)?\s*([a-z\s]+)/i,
      // rain in/of X
      /\b(?:rain|raining|precipitation|storm|snow).*?(?:in|at|for|of)?\s*([a-z\s]+)/i,
      // how about X / what about X
      /\b(?:how about|what about)\s+([a-z\s]+)/i,
      // in/at/for X today/tomorrow/etc
      /\b(?:in|at|for|of)\s+([a-z\s]+)\s*(?:today|tomorrow|right now|currently|tonight)?/i,
    ];


    const cleanupCity = (value: string) => {
      return value
        .replace(/[?.!,]/g, ' ')
        // Remove common leading phrases like "what is the weather in/of"
        .replace(/\bwhat(?:'s| is)?\s+the\s+weather\s+(?:in|at|for|of)?\b/gi, ' ')
        // Remove time-related words
        .replace(/\b(?:today|tomorrow|tonight|yesterday|now|right now|currently|please)\b/gi, '')
        // Strip trailing weather-related words
        .replace(/\s+(?:weather|temperature|forecast|rain|raining|storm|snow|humidity|wind)\b.*$/i, '')
        // Remove leading prepositions like "of", "in", "at", "for"
        .replace(/^(?:of|in|at|for)\s+/i, '')
        // Collapse multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
    };


    for (const pattern of patterns) {
      const match = normalizedText.match(pattern);
      if (match?.[1]) {
        const city = cleanupCity(match[1]);
        if (city) {
          return city;
        }
      }
    }

    // Fallback: use cleaned text if it looks reasonable
    const fallbackCity = cleanupCity(normalizedText);
    // Require at least 1–3 words and avoid obviously empty/generic stuff
    if (fallbackCity && fallbackCity.split(' ').length <= 3) {
      return fallbackCity;
    }

    return null;
  };

  // Identify when the user wants the weather (used to pick current vs forecast).
  const extractTimeIntent = (
    text: string
  ): 'now' | 'today' | 'tomorrow' | 'tonight' | 'yesterday' | null => {
    const normalizedText = text.toLowerCase();
    if (/\btomorrow\b/.test(normalizedText)) return 'tomorrow';
    if (/\btonight\b/.test(normalizedText)) return 'tonight';
    if (/\byesterday\b/.test(normalizedText)) return 'yesterday';
    if (/\btoday\b/.test(normalizedText)) return 'today';
    if (/\bnow\b|\bright now\b|\bcurrently\b/.test(normalizedText)) return 'now';
    return null;
  };

  // Determine which metric to emphasize in the response.
  const extractMetric = (
    text: string
  ): 'temperature' | 'rain' | 'humidity' | 'wind' | 'general' => {
    const normalizedText = text.toLowerCase();
    if (/\b(?:temperature|temp|hot|cold)\b/.test(normalizedText)) return 'temperature';
    if (/\b(?:rain|raining|drizzle|storm|precipitation|umbrella)\b/.test(normalizedText)) return 'rain';
    if (/\b(?:humidity|humid)\b/.test(normalizedText)) return 'humidity';
    if (/\b(?:wind|windy|breeze|gust)\b/.test(normalizedText)) return 'wind';
    return 'general';
  };

  const speakText = (text: string) => {
    setIsSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleVoiceInput = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Not supported',
        description: 'Speech recognition is not supported in your browser',
        variant: 'destructive',
      });
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    setIsListening(true);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log('User said:', transcript);

      const city = extractCity(transcript);
      const timeIntent = extractTimeIntent(transcript);
      const metric = extractMetric(transcript);

      if (!city) {
        speakText(
          "I couldn't understand which city you're asking about. Please try again and mention a city name."
        );
        setIsListening(false);
        return;
      }

      try {
        const timeLabel =
          timeIntent === 'tomorrow'
            ? 'for tomorrow'
            : timeIntent === 'tonight'
              ? 'for tonight'
              : timeIntent === 'yesterday'
                ? 'for yesterday'
                : 'right now';

        speakText(
          `Let me check the ${metric === 'general' ? 'weather' : metric} in ${city} ${timeLabel}...`
        );

        console.log('Time Intent', timeIntent);
        console.log('Metric', metric);

        const res = await fetch('/api/weather', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city,
            timeIntent: timeIntent ?? 'now', // let server default if null
            metric,
          }),
        });

        if (!res.ok) {
          // Try to read error from server if possible
          let errorMessage = 'Failed to fetch weather.';
          try {
            const errorData = await res.json();
            if (errorData?.error) errorMessage = errorData.error;
          } catch {
            // ignore JSON parse error, keep generic message
          }
          throw new Error(errorMessage);
        }

        const data = await res.json();
        const responseMetric =
          (data?.metric as 'temperature' | 'rain' | 'humidity' | 'wind' | 'general') || metric;

        // Prefer server-crafted message; otherwise build a metric-aware fallback.
        if (data.error) {
          speakText(data.error);
        } else if (data.message) {
          speakText(data.message);
        } else {
          const fallbackCity = data.city || city;
          const fallbackDescription = data.description || 'the current conditions';

          let response: string | null = null;

          if (responseMetric === 'wind') {
            // Wind: speak speed if present, otherwise fall back to a generic condition.
            response = data.windSpeed != null
              ? `The wind in ${fallbackCity} is blowing at ${data.windSpeed} meters per second.`
              : `I couldn't find wind information for ${fallbackCity}, but conditions are ${fallbackDescription}.`;
          } else if (responseMetric === 'rain') {
            if (data.rainChance != null) {
              // Rain: include probability and optional volume.
              const volumeText = data.rainVolume
                ? ` with about ${data.rainVolume} millimeters expected`
                : '';
              response = `The chance of rain in ${fallbackCity} is ${Math.round(
                data.rainChance
              )} percent${volumeText}.`;
            } else {
              response = `I don't have a rain probability for ${fallbackCity}, but conditions are ${fallbackDescription}.`;
            }
          } else if (responseMetric === 'humidity') {
            // Humidity: report percentage or fall back.
            response = data.humidity != null
              ? `The humidity in ${fallbackCity} is ${data.humidity} percent.`
              : `I couldn't find humidity data for ${fallbackCity}, but conditions are ${fallbackDescription}.`;
          } else {
            // Default general/temperature response.
            response = `The weather in ${fallbackCity} is currently ${data.temperature} degrees Celsius and ${fallbackDescription}. It feels like ${data.feelsLike} degrees.`;
          }

          speakText(response);
        }
      } catch (error) {
        console.error('Error:', error);
          let msg = error instanceof Error ? error.message : String(error);
          msg = msg.split('{')[0].trim();
          msg = msg.replace(/^Error:\s*/i, '').trim();
          speakText(msg);
      }

      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      toast({
        title: 'Error',
        description: 'Could not recognize speech. Please try again.',
        variant: 'destructive',
      });
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-8 max-w-md w-full">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Weather Voice Agent
          </h1>
          <p className="text-xl text-muted-foreground">
            Ask me about the weather in any city
          </p>
        </div>

        <div className="relative">
          <Button
            onClick={handleVoiceInput}
            size="icon"
            disabled={isSpeaking}
            className={`
              h-40 w-40 rounded-full transition-all duration-300 shadow-2xl
              ${isListening
                ? 'bg-destructive hover:bg-destructive/90 animate-pulse scale-110'
                : 'bg-primary hover:bg-primary/90 hover:scale-105'
              }
              ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isListening ? (
              <MicOff className="h-20 w-20" />
            ) : (
              <Mic className="h-20 w-20" />
            )}
          </Button>

          {isListening && (
            <div className="absolute inset-0 rounded-full border-4 border-destructive animate-ping" />
          )}
        </div>

        <div className="text-center">
          <p className="text-lg font-medium">
            {isSpeaking
              ? 'Speaking...'
              : isListening
                ? 'Listening...'
                : 'Click to speak'}
          </p>
          {!isListening && !isSpeaking && (
            <p className="text-sm text-muted-foreground mt-2">
              Try: "What's the weather in Mumbai?"
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceAgent;
