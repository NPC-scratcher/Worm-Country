/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Zap, Target, Settings, Play, RefreshCw, Crown, Monitor, Smartphone, X, Palette, Globe, Server } from 'lucide-react';
import { getDbForServer, servers } from './firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

// --- Constants & Types ---

const WORLD_SIZE = 6000;
const INITIAL_SNAKE_LENGTH = 10;
const SEGMENT_DISTANCE = 15;
const FOOD_COUNT = 2000;
const BOT_COUNT = 29; // 1 Player + 29 Bots = 30 Players per server
const VIEW_DISTANCE = 800;

interface Point {
  x: number;
  y: number;
}

interface Snake {
  id: string;
  name: string;
  segments: Point[];
  angle: number;
  targetAngle: number;
  speed: number;
  color: string;
  score: number;
  isBot: boolean;
  isDead: boolean;
  reactionTime?: number;
  frameCount?: number;
}

interface Food {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

const BOT_NAMES = [
  "SlitherKing", "NeonViper", "GridRunner", "ByteWorm", "CyberSnake", "PixelPython", "GlitchBoa",
  "NullPointer", "VoidWalker", "ShadowFang", "LightSpeed", "TurboTail", "GhostWorm", "Phantom",
  "Specter", "Wraith", "Reaper", "DoomBringer", "ChaosTheory", "NovaStrike", "StarDust", "Cosmic",
  "Galaxy", "Nebula", "Pulsar", "Quasar", "Comet", "Meteor", "Asteroid", "Titan", "Colossus",
  "Behemoth", "Leviathan", "Kraken", "Dragon", "Wyvern", "Drake", "Hydra", "Gorgon", "Medusa",
  "Cyclops", "Minotaur", "Centaur", "Griffin", "Phoenix", "Sphinx", "Chimera", "Banshee", "Goblin",
  "Orc", "Troll", "Ogre", "Giant", "Demon", "Devil", "Angel", "God", "King", "Queen", "Prince",
  "Princess", "Knight", "Lord", "Baron", "Duke", "Earl", "Viscount", "Alpha", "Bravo", "Charlie",
  "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett", "Kilo", "Lima", "Mike", "November",
  "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-ray",
  "Yankee", "Zulu", "Viper", "Cobra", "Python", "Mamba", "Boa", "Anaconda", "Worminator", "Snek"
];

// --- Helper Functions ---

const getRandomColor = () => {
  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#a855f7'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

const getDistance = (p1: Point, p2: Point) => {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
};

const getDistanceSq = (p1: Point, p2: Point) => {
  return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
};

// --- Game Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State Initialization with localStorage
  const [gameState, setGameState] = useState<'device_selection' | 'menu' | 'playing' | 'gameover'>(() => {
    const savedDevice = localStorage.getItem('worm_device');
    return savedDevice ? 'menu' : 'device_selection';
  });
  const [isMobile, setIsMobile] = useState(() => {
    return localStorage.getItem('worm_device') === 'mobile';
  });
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('worm_player_name') || 'Player';
  });
  const [playerColor, setPlayerColor] = useState(() => {
    return localStorage.getItem('worm_player_color') || '#3b82f6';
  });
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('worm_settings');
    return saved ? JSON.parse(saved) : { glow: true, showNames: true };
  });
  
  const [selectedServer, setSelectedServer] = useState(() => {
    return localStorage.getItem('worm_server') || 'server1';
  });
  const [gameMode, setGameMode] = useState<'practice' | 'online'>('practice');
  const [score, setScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [tick, setTick] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  
  // Game Refs (to avoid re-renders during game loop)
  const previousBotNames = useRef<Set<string>>(new Set());
  const playerRef = useRef<Snake | null>(null);
  const snakesRef = useRef<Snake[]>([]);
  const foodRef = useRef<Food[]>([]);
  const mouseRef = useRef<Point>({ x: 0, y: 0 });
  const keysPressed = useRef<Set<string>>(new Set());
  const joystickRef = useRef<{ x: number, y: number } | null>(null);
  const frameIdRef = useRef<number>(0);
  const dimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });

  // --- Initialization ---

  useEffect(() => {
    // Initialize background world
    const bots: Snake[] = Array.from({ length: BOT_COUNT }, (_, i) => {
      const startX = Math.random() * WORLD_SIZE;
      const startY = Math.random() * WORLD_SIZE;
      const angle = Math.random() * Math.PI * 2;
      return {
        id: `bot-${i}`,
        name: `Bot ${i + 1}`,
        segments: Array.from({ length: INITIAL_SNAKE_LENGTH }, (_, j) => ({
          x: startX,
          y: startY + j * SEGMENT_DISTANCE
        })),
        angle,
        targetAngle: angle,
        speed: 2 + Math.random() * 2,
        color: getRandomColor(),
        score: 0,
        isBot: true,
        isDead: false,
        reactionTime: Math.floor(Math.random() * 30) + 20, // 20 to 50 frames reaction delay (slower)
        frameCount: Math.floor(Math.random() * 50)
      };
    });

    const food: Food[] = Array.from({ length: FOOD_COUNT }, (_, i) => ({
      id: `food-${i}`,
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      size: 2 + Math.random() * 4,
      color: getRandomColor()
    }));

    snakesRef.current = bots;
    foodRef.current = food;
  }, []);

  // Fetch Global Leaderboard
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const db = getDbForServer(selectedServer);
        const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
        const snapshot = await getDocs(q);
        const topScores = snapshot.docs.map(doc => ({
          name: doc.data().name,
          score: doc.data().score
        }));
        setGlobalLeaderboard(topScores);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      }
    };
    
    if (gameState === 'menu') {
      fetchLeaderboard();
    }
  }, [selectedServer, gameState]);

  const initGame = useCallback(() => {
    const player: Snake = {
      id: 'player',
      name: playerName || 'Player',
      segments: Array.from({ length: INITIAL_SNAKE_LENGTH }, (_, i) => ({
        x: WORLD_SIZE / 2,
        y: WORLD_SIZE / 2 + i * SEGMENT_DISTANCE
      })),
      angle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      speed: 3,
      color: playerColor,
      score: 0,
      isBot: false,
      isDead: false
    };

    playerRef.current = player;
    snakesRef.current = [player, ...snakesRef.current.filter(s => s.id !== 'player')];
    setScore(0);
    setGameState('playing');
  }, []);

  // --- Game Loop Logic ---

  const update = useCallback(() => {
    const snakes = snakesRef.current;

    // 1. Update Snakes
    snakes.forEach(snake => {
      if (snake.isDead) return;

      // Bot AI
      if (snake.isBot) {
        const head = snake.segments[0];
        let targetAngle = snake.targetAngle;
        let speed = snake.speed;
        
        snake.frameCount = (snake.frameCount || 0) + 1;
        const reactionTime = snake.reactionTime || 15;
        
        // 1. Avoid boundaries (Highest priority, instant reaction)
        const margin = 150;
        if (head.x < margin) targetAngle = 0;
        else if (head.x > WORLD_SIZE - margin) targetAngle = Math.PI;
        else if (head.y < margin) targetAngle = Math.PI / 2;
        else if (head.y > WORLD_SIZE - margin) targetAngle = -Math.PI / 2;
        else if (snake.frameCount % reactionTime === 0) {
          // Only think every X frames (simulates reaction time)
          speed = 2 + Math.random(); // Reset speed
          
          // 2. Avoid or Attack other snakes
          let avoidanceDx = 0;
          let avoidanceDy = 0;
          let nearThreat = false;
          let attackTarget = null;
          let minAttackDistSq = 90000;

          snakes.forEach(other => {
            if (other.id === snake.id || other.isDead) return;
            
            // If we are significantly bigger, try to attack them (cut them off)
            if (snake.segments.length > other.segments.length + 5) {
              const otherHead = other.segments[0];
              const distSq = getDistanceSq(head, otherHead);
              if (distSq < 40000 && distSq < minAttackDistSq) { // 200 squared
                attackTarget = otherHead;
                minAttackDistSq = distSq;
              }
            }
            
            // Optimization: Only check head and a few segments, use squared distance
            for (let i = 0; i < Math.min(other.segments.length, 10); i += 3) {
              const seg = other.segments[i];
              if (getDistanceSq(head, seg) < 22500) { // 150 squared (increased vision)
                // Only fear them if they aren't much smaller
                if (other.segments.length >= snake.segments.length - 5) {
                  nearThreat = true;
                  avoidanceDx += head.x - seg.x;
                  avoidanceDy += head.y - seg.y;
                }
              }
            }
          });

          // 20% chance to completely ignore the threat (makes them make mistakes)
          if (nearThreat && Math.random() > 0.2) {
            targetAngle = Math.atan2(avoidanceDy, avoidanceDx) + (Math.random() - 0.5) * 0.5; // Imperfect turn
            speed = 5; // Boost away
          } else if (attackTarget && Math.random() > 0.3) {
            // Aggressive intercept: aim slightly ahead of their head
            targetAngle = Math.atan2(attackTarget.y - head.y, attackTarget.x - head.x);
            speed = 5; // Boost to attack
          } else {
            // 3. Seek food
            let closestFood = null;
            let minDistSq = 90000; // 300 squared

            foodRef.current.forEach(f => {
              const dSq = getDistanceSq(head, f);
              if (dSq < minDistSq) {
                minDistSq = dSq;
                closestFood = f;
              }
            });

            if (closestFood) {
              targetAngle = Math.atan2(closestFood.y - head.y, closestFood.x - head.x) + (Math.random() - 0.5) * 0.2; // Imperfect aim
            } else if (Math.random() < 0.1) {
              targetAngle += (Math.random() - 0.5);
            }
          }
        }
        
        snake.targetAngle = targetAngle;
        snake.speed = speed;

      } else {
        // Player target angle from Keyboard
        if (keysPressed.current.size > 0) {
          let dx = 0;
          let dy = 0;
          if (keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp')) dy -= 1;
          if (keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown')) dy += 1;
          if (keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft')) dx -= 1;
          if (keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight')) dx += 1;
          
          if (dx !== 0 || dy !== 0) {
            snake.targetAngle = Math.atan2(dy, dx);
          }
        }
        
        // Player target angle from Joystick
        if (joystickRef.current) {
          snake.targetAngle = Math.atan2(joystickRef.current.y, joystickRef.current.x);
        }
      }

      // Smooth angle transition (slower for larger snakes)
      let angleDiff = snake.targetAngle - snake.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      
      // Calculate max turn speed based on length (longer = slower)
      let maxTurnSpeed = 0.15 - (snake.segments.length * 0.0005);
      maxTurnSpeed = Math.max(0.04, maxTurnSpeed); // Minimum turn speed
      
      // Bots turn slightly slower than players to give players an edge
      const turnSpeed = snake.isBot ? maxTurnSpeed * 0.7 : maxTurnSpeed;
      
      // Clamp angle difference to max turn speed
      if (angleDiff > turnSpeed) angleDiff = turnSpeed;
      if (angleDiff < -turnSpeed) angleDiff = -turnSpeed;
      
      snake.angle += angleDiff;

      // Move head
      const head = snake.segments[0];
      const currentSpeed = snake.speed;
      
      // Speed boost cost
      if (currentSpeed > 4 && snake.score > 0 && frameIdRef.current % 5 === 0) {
        snake.score -= 1;
        if (!snake.isBot) setScore(snake.score);
        // Leave food behind
        if (frameIdRef.current % 10 === 0) {
          const tail = snake.segments[snake.segments.length - 1];
          foodRef.current.push({
            id: `boost-food-${Math.random()}`,
            x: tail.x,
            y: tail.y,
            size: 2,
            color: snake.color
          });
        }
      }

      const newHead = {
        x: head.x + Math.cos(snake.angle) * currentSpeed,
        y: head.y + Math.sin(snake.angle) * currentSpeed
      };

      // World boundaries (Fatal)
      if (newHead.x < 0 || newHead.x > WORLD_SIZE || newHead.y < 0 || newHead.y > WORLD_SIZE) {
        snake.isDead = true;
        if (snake.id === 'player') setGameState('gameover');
        return;
      }

      // Update segments
      const newSegments = [newHead];
      let prev = newHead;
      for (let i = 1; i < snake.segments.length; i++) {
        const curr = snake.segments[i];
        const dist = getDistance(prev, curr);
        if (dist > SEGMENT_DISTANCE) {
          const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
          newSegments.push({
            x: prev.x + Math.cos(angle) * SEGMENT_DISTANCE,
            y: prev.y + Math.sin(angle) * SEGMENT_DISTANCE
          });
        } else {
          newSegments.push(curr);
        }
        prev = newSegments[i];
      }
      snake.segments = newSegments;

      // 2. Food Collision
      foodRef.current = foodRef.current.filter(f => {
        if (getDistanceSq(snake.segments[0], f) < (20 + f.size) ** 2) {
          snake.score += Math.floor(f.size);
          // Grow snake
          if (snake.score % 10 === 0) {
            const last = snake.segments[snake.segments.length - 1];
            snake.segments.push({ ...last });
          }
          if (!snake.isBot) setScore(snake.score);
          return false;
        }
        return true;
      });

      // Respawn food
      while (foodRef.current.length < FOOD_COUNT) {
        foodRef.current.push({
          id: `food-${Math.random()}`,
          x: Math.random() * WORLD_SIZE,
          y: Math.random() * WORLD_SIZE,
          size: 2 + Math.random() * 4,
          color: getRandomColor()
        });
      }
    });

    // 3. Snake Collision
    snakes.forEach(snake => {
      if (snake.isDead) return;
      const head = snake.segments[0];

      snakes.forEach(other => {
        if (other.isDead) return;
        
        other.segments.forEach((seg, idx) => {
          // Disable self-collision: Don't collide with own body
          if (snake.id === other.id) return;

          if (getDistanceSq(head, seg) < 225) { // 15 squared
            snake.isDead = true;
            // Turn snake into food
            snake.segments.forEach((s, i) => {
              if (i % 2 === 0) {
                foodRef.current.push({
                  id: `death-food-${Math.random()}`,
                  x: s.x + (Math.random() - 0.5) * 20,
                  y: s.y + (Math.random() - 0.5) * 20,
                  size: 5 + Math.random() * 5,
                  color: snake.color
                });
              }
            });

            if (snake.id === 'player') {
              setGameState('gameover');
              // Save score to Firebase if playing online
              if (gameMode === 'online' && snake.score > 100) {
                const db = getDbForServer(selectedServer);
                addDoc(collection(db, 'leaderboard'), {
                  name: snake.name,
                  score: snake.score,
                  timestamp: serverTimestamp()
                }).catch(console.error);
              }
            }
          }
        });
      });
    });

    // Update Leaderboard & UI (Throttled)
    if (frameIdRef.current % 10 === 0) {
      const topSnakes = [...snakes]
        .filter(s => !s.isDead)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(s => ({ name: s.name, score: s.score }));
      setLeaderboard(topSnakes);
      
      // Force a re-render for the minimap and other non-state HUD elements
      setTick(t => t + 1);
    }
  }, []);

  // --- Rendering ---

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensionsRef.current;
    const player = playerRef.current;
    
    // Camera follows player or center if in menu
    const cameraX = player ? player.segments[0].x : WORLD_SIZE / 2;
    const cameraY = player ? player.segments[0].y : WORLD_SIZE / 2;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid with Perspective
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    const gridSize = 100;
    const startX = Math.floor((cameraX - width / 2) / gridSize) * gridSize;
    const startY = Math.floor((cameraY - height / 2) / gridSize) * gridSize;

    for (let x = startX; x < startX + width + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x - cameraX + width / 2, 0);
      ctx.lineTo(x - cameraX + width / 2, height);
      ctx.stroke();
    }
    for (let y = startY; y < startY + height + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y - cameraY + height / 2);
      ctx.lineTo(width, y - cameraY + height / 2);
      ctx.stroke();
    }

    // Draw World Boundaries
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 10;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ef4444';
    ctx.strokeRect(
      -cameraX + width / 2,
      -cameraY + height / 2,
      WORLD_SIZE,
      WORLD_SIZE
    );
    ctx.shadowBlur = 0;

    // Draw Food (Optimized: no gradients)
    foodRef.current.forEach(f => {
      const dx = f.x - cameraX;
      const dy = f.y - cameraY;
      if (Math.abs(dx) < width / 2 + 50 && Math.abs(dy) < height / 2 + 50) {
        const screenX = dx + width / 2;
        const screenY = dy + height / 2;

        // Simple glow
        ctx.fillStyle = f.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(screenX, screenY, f.size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(screenX, screenY, f.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw Snakes
    snakesRef.current.forEach(snake => {
      if (snake.isDead) return;

      // Draw segments from tail to head for proper layering
      for (let i = snake.segments.length - 1; i >= 0; i--) {
        const seg = snake.segments[i];
        const dx = seg.x - cameraX;
        const dy = seg.y - cameraY;

        if (Math.abs(dx) < width / 2 + 50 && Math.abs(dy) < height / 2 + 50) {
          const screenX = dx + width / 2;
          const screenY = dy + height / 2;
          
          // Tapering size: tail is smaller
          const sizeRatio = 1 - (i / snake.segments.length) * 0.4;
          const size = 18 * sizeRatio;

          // Body segment (Outer)
          if (settings.glow) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = snake.color;
          } else {
            ctx.shadowBlur = 0;
          }
          
          ctx.globalAlpha = settings.glow ? 0.8 : 1.0;
          ctx.beginPath();
          ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
          ctx.fillStyle = snake.color;
          ctx.fill();
          
          ctx.shadowBlur = 0; // Reset for inner details
          
          // Inner shadow/highlight for 3D segmented effect
          ctx.beginPath();
          ctx.arc(screenX, screenY, size * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fill();
          
          // Outline
          ctx.beginPath();
          ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1.0;

          // Speed boost trail (instead of a single large sphere)
          if (snake.speed > 4 && settings.glow && i < 8) {
            const auraSize = size * (1 + (8 - i) * 0.15);
            ctx.beginPath();
            ctx.arc(screenX, screenY, auraSize, 0, Math.PI * 2);
            ctx.fillStyle = snake.color;
            ctx.globalAlpha = 0.15 * (1 - i / 8);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          }

          // Eyes for the head
          if (i === 0) {
            const eyeOffset = size * 0.6;
            const eyeSize = size * 0.4;
            const pupilSize = size * 0.2;
            const angle = snake.angle;
            
            // Left eye
            const lx = screenX + Math.cos(angle + 0.6) * eyeOffset;
            const ly = screenY + Math.sin(angle + 0.6) * eyeOffset;
            ctx.beginPath(); ctx.arc(lx, ly, eyeSize, 0, Math.PI * 2);
            ctx.fillStyle = 'white'; ctx.fill();
            ctx.beginPath(); ctx.arc(lx + Math.cos(angle)*1, ly + Math.sin(angle)*1, pupilSize, 0, Math.PI * 2);
            ctx.fillStyle = 'black'; ctx.fill();

            // Right eye
            const rx = screenX + Math.cos(angle - 0.6) * eyeOffset;
            const ry = screenY + Math.sin(angle - 0.6) * eyeOffset;
            ctx.beginPath(); ctx.arc(rx, ry, eyeSize, 0, Math.PI * 2);
            ctx.fillStyle = 'white'; ctx.fill();
            ctx.beginPath(); ctx.arc(rx + Math.cos(angle)*1, ry + Math.sin(angle)*1, pupilSize, 0, Math.PI * 2);
            ctx.fillStyle = 'black'; ctx.fill();
          }
        }
      }

      // Draw Name Tag
      if (snake.id !== 'player' && settings.showNames) {
        const head = snake.segments[0];
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(snake.name, head.x - cameraX + width / 2, head.y - cameraY + height / 2 - 30);
      }
    });

  }, []);

  const loop = useCallback(() => {
    update();
    draw();
    frameIdRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  // --- Effects ---

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('worm_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('worm_player_name', playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem('worm_player_color', playerColor);
  }, [playerColor]);

  useEffect(() => {
    localStorage.setItem('worm_server', selectedServer);
  }, [selectedServer]);

  useEffect(() => {
    const handleResize = () => {
      dimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseDown = () => {
      if (playerRef.current) playerRef.current.speed = 6;
    };

    const handleMouseUp = () => {
      if (playerRef.current) playerRef.current.speed = 3;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.code);
      if (e.code === 'Space' && playerRef.current) playerRef.current.speed = 6;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.code);
      if (e.code === 'Space' && playerRef.current) playerRef.current.speed = 3;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(frameIdRef.current);
    };
  }, []);

  useEffect(() => {
    frameIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [loop]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* Game Canvas Container with 3D Perspective */}
      <div 
        className="absolute inset-0 w-full h-full"
        style={{ 
          perspective: '1000px',
          perspectiveOrigin: '50% 50%'
        }}
      >
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${gameState === 'playing' ? 'cursor-none' : 'cursor-default'}`}
          style={{ 
            transform: 'rotateX(10deg) scale(1.1)',
            transformOrigin: 'center center'
          }}
        />
      </div>

      {/* Minimap */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-40 h-40 bg-slate-900/60 backdrop-blur-md border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
        <div className="relative w-full h-full">
          {/* Player Dot */}
          {playerRef.current && (
            <div 
              className="absolute w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)] z-20"
              style={{ 
                left: `${(playerRef.current.segments[0].x / WORLD_SIZE) * 100}%`, 
                top: `${(playerRef.current.segments[0].y / WORLD_SIZE) * 100}%`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          )}
          {/* Bot Dots */}
          {snakesRef.current.filter(s => s.isBot && !s.isDead).map(s => (
            <div 
              key={s.id}
              className="absolute w-1 h-1 bg-slate-500 rounded-full"
              style={{ 
                left: `${(s.segments[0].x / WORLD_SIZE) * 100}%`, 
                top: `${(s.segments[0].y / WORLD_SIZE) * 100}%`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          ))}
        </div>
      </div>

      {/* HUD */}
      <AnimatePresence>
        {gameState === 'playing' && (
          <>
            {/* Joystick for Mobile */}
            {isMobile && (
              <div className="absolute bottom-12 left-12 z-30 w-32 h-32 flex items-center justify-center">
                <div 
                  className="relative w-24 h-24 bg-slate-900/40 backdrop-blur-md border border-slate-700 rounded-full flex items-center justify-center touch-none"
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    const rect = e.currentTarget.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const dx = touch.clientX - centerX;
                    const dy = touch.clientY - centerY;
                    joystickRef.current = { x: dx, y: dy };
                  }}
                  onTouchMove={(e) => {
                    const touch = e.touches[0];
                    const rect = e.currentTarget.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const dx = touch.clientX - centerX;
                    const dy = touch.clientY - centerY;
                    joystickRef.current = { x: dx, y: dy };
                  }}
                  onTouchEnd={() => {
                    joystickRef.current = null;
                  }}
                >
                  <motion.div 
                    className="w-10 h-10 bg-blue-500 rounded-full shadow-[0_0_15px_#3b82f6]"
                    animate={{
                      x: joystickRef.current ? Math.min(Math.max(joystickRef.current.x, -30), 30) : 0,
                      y: joystickRef.current ? Math.min(Math.max(joystickRef.current.y, -30), 30) : 0,
                    }}
                    transition={{ type: "spring", damping: 10, stiffness: 200 }}
                  />
                </div>
              </div>
            )}

            {/* Mobile Boost Button */}
            {isMobile && (
              <div 
                className="absolute bottom-12 right-12 z-30 w-20 h-20 bg-blue-600/20 backdrop-blur-md border border-blue-500/40 rounded-full flex items-center justify-center touch-none active:bg-blue-600/40 transition-colors"
                onTouchStart={() => { if (playerRef.current) playerRef.current.speed = 6; }}
                onTouchEnd={() => { if (playerRef.current) playerRef.current.speed = 3; }}
              >
                <Zap className="w-8 h-8 text-blue-400" />
              </div>
            )}

            {/* Top Left: Score */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute top-6 left-6 z-10"
            >
              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-2xl shadow-2xl flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Zap className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mass</p>
                    <p className="text-2xl font-black text-white tabular-nums">{score}</p>
                  </div>
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                  {gameMode === 'online' ? <Globe className="w-3 h-3 text-green-400" /> : <Target className="w-3 h-3 text-slate-400" />}
                  {gameMode === 'online' ? 'Online Server' : 'Practice Mode'}
                </div>
              </div>
            </motion.div>

            {/* Top Right: Leaderboard */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-6 right-6 z-10"
            >
              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-2xl shadow-2xl w-64">
                <div className="flex items-center gap-2 mb-4 border-b border-slate-700 pb-2">
                  <Crown className="w-4 h-4 text-yellow-500" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Leaderboard</h3>
                </div>
                <div className="space-y-2">
                  {leaderboard.map((entry, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className={`font-medium ${i === 0 ? 'text-yellow-400' : i < 3 ? 'text-slate-200' : 'text-slate-400'}`}>
                        {i + 1}. {entry.name}
                      </span>
                      <span className="text-slate-500 font-mono">{entry.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Device Selection Overlay */}
      <AnimatePresence>
        {gameState === 'device_selection' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950"
          >
            <div className="max-w-2xl w-full px-6 text-center">
              <h1 className="text-5xl font-black text-white tracking-tighter italic mb-12 drop-shadow-2xl">
                SELECT YOUR <span className="text-blue-500">DEVICE</span>
              </h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button
                  onClick={() => {
                    setIsMobile(false);
                    localStorage.setItem('worm_device', 'pc');
                    setGameState('menu');
                  }}
                  className="group relative bg-slate-900 border border-slate-700 hover:border-blue-500 p-10 rounded-3xl transition-all hover:scale-105 shadow-2xl flex flex-col items-center gap-6"
                >
                  <Monitor className="w-20 h-20 text-slate-400 group-hover:text-blue-400 transition-colors" />
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">PC / Mac</h2>
                    <p className="text-slate-400 text-sm">Keyboard & Mouse controls</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setIsMobile(true);
                    localStorage.setItem('worm_device', 'mobile');
                    setGameState('menu');
                  }}
                  className="group relative bg-slate-900 border border-slate-700 hover:border-blue-500 p-10 rounded-3xl transition-all hover:scale-105 shadow-2xl flex flex-col items-center gap-6"
                >
                  <Smartphone className="w-20 h-20 text-slate-400 group-hover:text-blue-400 transition-colors" />
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Mobile / Tablet</h2>
                    <p className="text-slate-400 text-sm">Touchscreen Joystick</p>
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customization Modal */}
      <AnimatePresence>
        {showCustomization && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-sm w-full relative"
            >
              <button 
                onClick={() => setShowCustomization(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                <Palette className="w-6 h-6" /> CUSTOMIZE
              </h2>
              
              <div className="space-y-6">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Player Name</p>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value.slice(0, 15))}
                    placeholder="Enter your name..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
                
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Worm Color</p>
                  <div className="flex flex-wrap gap-3">
                    {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#ffffff'].map(color => (
                      <button
                        key={color}
                        onClick={() => setPlayerColor(color)}
                        className={`w-10 h-10 rounded-full transition-all ${playerColor === color ? 'scale-110 ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-sm w-full relative"
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                <Settings className="w-6 h-6" /> SETTINGS
              </h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">Neon Glow</p>
                    <p className="text-slate-400 text-xs">Disable for better performance</p>
                  </div>
                  <button 
                    onClick={() => setSettings(s => ({ ...s, glow: !s.glow }))}
                    className={`w-14 h-8 rounded-full p-1 transition-colors ${settings.glow ? 'bg-blue-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full transition-transform ${settings.glow ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">Show Names</p>
                    <p className="text-slate-400 text-xs">Display bot names</p>
                  </div>
                  <button 
                    onClick={() => setSettings(s => ({ ...s, showNames: !s.showNames }))}
                    className={`w-14 h-8 rounded-full p-1 transition-colors ${settings.showNames ? 'bg-blue-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full transition-transform ${settings.showNames ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">Controls</p>
                    <p className="text-slate-400 text-xs">PC (WASD) or Mobile (Touch)</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newIsMobile = !isMobile;
                      setIsMobile(newIsMobile);
                      localStorage.setItem('worm_device', newIsMobile ? 'mobile' : 'pc');
                    }}
                    className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl border border-slate-600 hover:bg-slate-700 transition-colors"
                  >
                    {isMobile ? 'MOBILE' : 'PC'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu Overlay */}
      <AnimatePresence>
        {gameState === 'menu' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-sm"
          >
            <div className="relative flex flex-col items-center max-w-md w-full px-6">
              {/* Logo Section */}
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mb-12 text-center"
              >
                <h1 className="text-7xl font-black text-white tracking-tighter italic leading-none drop-shadow-2xl mb-8">
                  WORM<span className="text-blue-500">COUNTRY</span>
                </h1>
              </motion.div>

              {/* Server Selection */}
              <div className="w-full mb-6">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest text-center mb-3 flex items-center justify-center gap-2">
                  <Server className="w-4 h-4" /> Select Server
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {servers.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedServer(s.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        selectedServer === s.id 
                          ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                          : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Play Buttons */}
              <div className="w-full flex flex-col gap-3 mb-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setGameMode('online');
                    initGame();
                  }}
                  className="group relative w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xl rounded-full shadow-[0_0_30px_rgba(37,99,235,0.4)] transition-all duration-300 overflow-hidden"
                >
                  <div className="relative z-10 flex items-center justify-center gap-3">
                    <Crown className="w-6 h-6 fill-current" />
                    PLAY ONLINE
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setGameMode('practice');
                    initGame();
                  }}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-lg rounded-full transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Target className="w-5 h-5" />
                  PRACTICE (BOTS)
                </motion.button>
              </div>

              {/* Menu Buttons */}
              <div className="grid grid-cols-2 gap-4 w-full mb-8">
                <button
                  onClick={() => setShowCustomization(true)}
                  className="py-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                >
                  <Palette className="w-4 h-4" />
                  Customize
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="py-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </div>

              {/* Global Leaderboard Preview */}
              <div className="w-full bg-slate-900/50 border border-slate-700 rounded-3xl p-6 shadow-inner">
                <h3 className="text-white font-black mb-4 flex items-center justify-center gap-2 text-sm uppercase tracking-widest">
                  <Globe className="w-4 h-4 text-blue-400" /> Global Top 5
                </h3>
                {globalLeaderboard.length > 0 ? (
                  <div className="space-y-3">
                    {globalLeaderboard.slice(0, 5).map((entry, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                        <span className="text-white font-bold flex items-center gap-3">
                          <span className="text-slate-500 w-4">{idx + 1}.</span> {entry.name}
                        </span>
                        <span className="font-mono text-blue-400 font-bold">{entry.score}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 text-sm py-4">No scores yet. Be the first!</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Overlay */}
      <AnimatePresence>
        {gameState === 'gameover' && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(16px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80"
          >
            <div className="max-w-md w-full p-8 text-center">
              <motion.div
                initial={{ scale: 0.8, y: 50, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
              >
                <div className="mb-6 inline-flex p-5 bg-red-500/10 rounded-full border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                  <RefreshCw className="w-12 h-12 text-red-500" />
                </div>
                <h2 className="text-6xl font-black text-white mb-10 tracking-tighter drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">ELIMINATED</h2>
                
                <div className="bg-slate-900/80 border border-slate-700 p-8 rounded-3xl mb-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
                  <p className="text-slate-400 text-xs font-bold uppercase mb-2 tracking-widest">Final Mass</p>
                  <p className="text-7xl font-black text-white">{score}</p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={initGame}
                    className="w-full py-5 bg-white text-slate-950 hover:bg-slate-200 rounded-2xl font-black text-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Play className="w-6 h-6 fill-current" />
                    PLAY AGAIN
                  </button>
                  
                  <button
                    onClick={() => setGameState('menu')}
                    className="w-full py-4 bg-transparent border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 rounded-2xl font-bold text-sm transition-all uppercase tracking-widest"
                  >
                    Main Menu
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.1),transparent_70%)]" />
      </div>
    </div>
  );
}
