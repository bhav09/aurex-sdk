"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { User, Key, Settings, LogOut } from "lucide-react";
import { aurexAPI } from "@/lib/api-client";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function UserDropdown() {
    const router = useRouter();
    const userInfo = aurexAPI.getUserInfo();

    const email = userInfo?.email || "";
    const username = userInfo?.user_name || "";

    const [greeting, setGreeting] = React.useState("Hi");
    const [nameText, setNameText] = React.useState("User");

    React.useEffect(() => {
        const GREETINGS = [
            "Hi", "Hey", "Wassup", "Yo", "Hello", "Hola", "Bonjour", "Ciao", "Howdy", "Ahoy", "Aloha", "Salute"
        ];
        const ADJECTIVES_NAMES = [
            "champion", "legend", "rockstar", "superstar", "genius", "handsome", "sexy", "beautiful", "chief", "boss", "friend", "partner",
            "super saiyan", "z fighter", "saiyan warrior", "hokage", "shinobi", "jonin", "anbu", "sannin", "sensei",
            "avenger", "super soldier", "sorcerer supreme", "asgardian", "shield agent", "wakandan", "guardians hero",
            "soul reaper", "state alchemist", "hashira", "special grade", "pirate king", "nakama",
            "jedi master", "padawan", "bounty hunter", "superhero", "ninja", "jedi", "wizard", "warrior"
        ];

        // Pick a random greeting
        const randomGreeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        setGreeting(randomGreeting);

        // Get user's first name or fallback
        let firstName = "User";
        if (username) {
            firstName = username.split(" ")[0];
        } else if (email) {
            const prefix = email.split("@")[0];
            firstName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        }

        // 50% chance of user's first name, 50% chance of dynamic positive/fun adjective/name
        if (Math.random() > 0.5) {
            setNameText(firstName);
        } else {
            const randomAdj = ADJECTIVES_NAMES[Math.floor(Math.random() * ADJECTIVES_NAMES.length)];
            // Capitalize first letter of each word in dynamic name (e.g. "Super Saiyan")
            const capitalizedAdj = randomAdj
                .split(" ")
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
            setNameText(capitalizedAdj);
        }
    }, [username, email]);

    const initial = username 
        ? username.charAt(0).toUpperCase() 
        : (email ? email.charAt(0).toUpperCase() : "U");

    const handleSignOut = () => {
        aurexAPI.clearSession();
        router.replace("/");
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 outline-none cursor-pointer group select-none">
                <Avatar className="h-8 w-8 rounded-full border border-white/[0.08] bg-white/10 transition-all duration-200 group-hover:border-white/20 group-hover:ring-2 group-hover:ring-white/5">
                    <AvatarFallback className="text-white text-xs font-semibold bg-transparent">
                        {initial}
                    </AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors duration-200">
                    {greeting} {nameText}
                </span>
            </DropdownMenuTrigger>
            
            <DropdownMenuContent 
                align="end" 
                sideOffset={8}
                className="w-56 bg-[#0A0A0A]/95 border-white/[0.08] backdrop-blur-2xl rounded-xl p-1.5 shadow-2xl text-white"
            >
                <DropdownMenuLabel className="px-2.5 py-2 flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-white/90 truncate">
                        {username || "Workspace User"}
                    </span>
                    <span className="text-[10px] text-white/40 font-mono truncate">
                        {email || "No email"}
                    </span>
                </DropdownMenuLabel>
                
                <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
                
                <DropdownMenuItem 
                    onClick={() => router.push("/app/profile")}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/70 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors cursor-pointer"
                >
                    <User className="w-4 h-4 text-white/40" />
                    Profile
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                    onClick={() => router.push("/app/settings?tab=apikeys")}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/70 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors cursor-pointer"
                >
                    <Key className="w-4 h-4 text-white/40" />
                    API Keys
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                    onClick={() => router.push("/app/settings")}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/70 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors cursor-pointer"
                >
                    <Settings className="w-4 h-4 text-white/40" />
                    Settings
                </DropdownMenuItem>
                
                <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
                
                <DropdownMenuItem 
                    onClick={handleSignOut}
                    variant="destructive"
                    className="flex items-center gap-2.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer focus:bg-rose-500/10 dark:focus:bg-rose-500/10 focus:text-rose-300"
                >
                    <LogOut className="w-4 h-4 text-rose-400/60" />
                    Sign Out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
