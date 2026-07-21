"use client";

import { useEffect, useState } from "react";

export function useCountdown() {
    const [time, setTime] = useState({ h: "00", m: "00", s: "00" });

    useEffect(() => {
        function updateTime() {
            const now = new Date();
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            const diff = end.getTime() - now.getTime();
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            setTime({
                h: String(h).padStart(2, "0"),
                m: String(m).padStart(2, "0"),
                s: String(s).padStart(2, "0"),
            });
        }

        updateTime();
        const timerId = setInterval(updateTime, 1000);

        return () => clearInterval(timerId);
    }, []);

    return time;
}
