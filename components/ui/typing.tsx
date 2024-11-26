import { useState, useEffect } from 'react';
import axios from 'axios';

export default function AnimatedText() {
    const [messages, setMessages] = useState<string[]>([]);
    const [currentText, setCurrentText] = useState('');
    const [charIndex, setCharIndex] = useState(0);
    const [showCursor, setShowCursor] = useState(true);
    const [isTyping, setIsTyping] = useState(true);

    // Fetch messages from the backend
    useEffect(() => {
        axios
            .get('/api/thoughts')
            .then((res) => {
                const fetchedMessages = res.data.map((item: { text: string }) => item.text);
                setMessages(fetchedMessages);
            })
            .catch((err) => {
                console.log(err);
            });
    }, []);

    // Typing effect
    useEffect(() => {
        if (messages.length > 0) {
            if (charIndex < currentText.length) {
                const typingTimeout = setTimeout(() => {
                    setCharIndex((prev) => prev + 1);
                }, 100);

                return () => clearTimeout(typingTimeout);
            } else {
                setIsTyping(false);
                const resetTimeout = setTimeout(() => {
                    setCurrentText('');
                    setCharIndex(0);
                    const randomIndex = Math.floor(Math.random() * messages.length); // Get random index
                    setCurrentText(messages[randomIndex]); // Set new random message
                    setIsTyping(true);
                }, 2000);

                return () => clearTimeout(resetTimeout);
            }
        }
    }, [charIndex, currentText, messages]);

    // Cursor blinking effect
    useEffect(() => {
        const cursorBlinkInterval = setInterval(() => {
            setShowCursor((prev) => !prev);
        }, 500);

        return () => clearInterval(cursorBlinkInterval);
    }, []);

    return (
        <div className="w-full items-center relative flex justify-center h-40 bg-stone-900 border border-stone-600 text-gray-200 rounded-md">
            <div className="absolute h-8 items-center h-8 top-4 left-4 flex gap-2">
                <b> $TARDI</b>
                <div className="bottom-1 typing">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
            <span>{currentText.slice(0, charIndex)}</span>
            <span className={`${showCursor ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
                |
            </span>
        </div>
    );
}
