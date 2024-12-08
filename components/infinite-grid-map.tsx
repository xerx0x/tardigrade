"use client"

import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import axios from 'axios';
import { ITransaction, tardigradeHistory } from './types';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImprovedTooltip } from './ToolTip';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Spotlight } from "@/components/ui/Spotlight";
import AnimatedText from "@/components/ui/typing"

const shortenHash = (hash: string): string => {
  if (!hash) return '';
  return `${hash.slice(0, 4)}...${hash.slice(-4)}`;
}


export function InfiniteGridMapComponent() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Set<string>>(new Set())
  const tardigradeImageRef = useRef<HTMLImageElement | null>(null);

  const [camera, setCamera] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })

  const [tardigradePosition, settardigradePosition] = useState({ x: 0, y: 0 })
  const [tardigradeHistory, settardigradeHistory] = useState<tardigradeHistory[]>([])

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<tardigradeHistory | null>(null)

  const [hoveredHistoryItem, setHoveredHistoryItem] = useState<tardigradeHistory | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }) // For tooltip position

  const [cellSize, setCellSize] = useState(40)
  const [dotSize, setDotSize] = useState(6)
  const [tardigradeSize, settardigradeSize] = useState(50)

  // Add this new function near other state declarations
  const animationRef = useRef<number>()
  const [, setIsLocating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [recentTransactions, setRecentTransactions] = useState<ITransaction[]>([])
  const [activeTab, setActiveTab] = useState<'history' | 'recent'>('recent');

  const historyScreenPositionsRef = useRef<{ x: number, y: number, data: tardigradeHistory }[]>([])

  const [isLoadingRpc, setIsLoadingRpc] = useState(false); // Separate loading state for /api/rpc
  const [isLoadingRecent, setIsLoadingRecent] = useState(false); // Separate loading state for /api/recent

  useEffect(() => {
    // start super zoomed out
    const ZOOM_FACTOR = 0.2
    setCellSize(prev => prev * ZOOM_FACTOR)
    setDotSize(prev => prev * ZOOM_FACTOR)
    settardigradeSize(prev => prev * ZOOM_FACTOR)
  }, [])

  // Disable pull to refresh
  useEffect(() => {
    // Check if the device supports touch events
    const preventDefault = (e: TouchEvent) => {
      e.preventDefault();
    };
  
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      // Attach event only for touch-enabled devices
      document.addEventListener('touchmove', preventDefault, { passive: false });
  
      // Cleanup function to remove the event listener
      return () => {
        document.removeEventListener('touchmove', preventDefault);
      };
    }
  }, []);

  useEffect(() => {
    const tardigradeImage = new Image();
    tardigradeImage.src = '/tardi.png';
    tardigradeImage.onload = () => {
      tardigradeImageRef.current = tardigradeImage;
    };
  }, []);


  useEffect(() => {
    const fetchData = () => {
      setIsLoadingRpc(true); // Start loading for the first API
      setIsLoadingRecent(true); // Start loading for the second API
  
      // Fetch RPC data
      axios.get('/api/rpc')
        .then((res) => {
          const data = res.data;
          settardigradeHistory(data);
          const latesttardigradePosition = data[data.length - 1];
          if (latesttardigradePosition) {
            settardigradePosition({
              x: latesttardigradePosition.x,
              y: latesttardigradePosition.y
            });
          }
        })
        .catch((error) => {
          console.error('Error fetching RPC data:', error);
        })
        .finally(() => {
          setIsLoadingRpc(false); // Stop loading for the first API
          setIsLoading(false);
        });
  
      // Fetch recent transactions
      axios.get('/api/recent')
        .then((res) => {
          setRecentTransactions(res.data);
        })
        .catch((error) => {
          console.error('Error fetching recent transactions:', error);
        })
        .finally(() => {
          setIsLoadingRecent(false); // Stop loading for the second API
        });
    };
  
    // Initial fetch
    fetchData();
    locatetardigrade()

    // Set up interval to fetch every minute
    const interval = setInterval(fetchData, 60000);
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);
  
  
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.font = '10px Arial';
    ctx.fillStyle = '#bbb';
  
    const startX = Math.floor(camera.x / cellSize) * cellSize - camera.x;
    const startY = Math.floor(camera.y / cellSize) * cellSize - camera.y;
  
    // Adjust label interval based on zoom level, ensuring labels are not too frequent
    const dynamicLabelInterval = Math.max(1, Math.floor(40 / cellSize)); 
  
    // Draw vertical grid lines
    for (let x = startX; x < width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
  
      const gridX = Math.floor((x + camera.x) / cellSize);
      if (gridX % dynamicLabelInterval === 0) { 
        ctx.fillText(gridX.toString(), x + 2, 10);
      }
    }
  
    // Draw horizontal grid lines
    for (let y = startY; y < height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
  
      const gridY = Math.floor((y + camera.y) / cellSize);
      if (gridY % dynamicLabelInterval === 0) {
        ctx.fillText(gridY.toString(), 2, y - 2);
      }
    }
  
  }, [camera, cellSize]);

  const drawDots = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = 'rgba(0, 100, 255, 0.7)';
    
    // Only check the bounds once for performance.
    const minX = -dotSize;
    const maxX = width + dotSize;
    const minY = -dotSize;
    const maxY = height + dotSize;
  
    gridRef.current.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const screenX = x * cellSize - camera.x;
      const screenY = y * cellSize - camera.y;
      
      // Check if the dot is in the visible area
      if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [camera, cellSize, dotSize]);
  

  const drawtardigradeHistory = useCallback((ctx: CanvasRenderingContext2D) => {
    // Cache current tardigrade position for efficient comparison
    const { x: tardigradeX, y: tardigradeY } = tardigradePosition;
  
    // Reset history positions array once per render
    historyScreenPositionsRef.current = [];
  
    tardigradeHistory.forEach((historyItem) => {
      // Set fill style based on the position
      if (historyItem.x === tardigradeX && historyItem.y === tardigradeY) {
        ctx.fillStyle = 'rgba(128, 128, 128, 0)'; // Very transparent grey
      } else if (historyItem.x === 0 && historyItem.y === 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)'; // Red for origin
      } else {
        ctx.fillStyle = 'rgb(214, 214, 214)'; // Regular grey
      }
  
      // Calculate screen position
      const screenX = historyItem.x * cellSize - camera.x;
      const screenY = historyItem.y * cellSize - camera.y;
  
      // Draw the history point as a circle
      ctx.beginPath();
      ctx.arc(screenX, screenY, tardigradeSize / 8, 0, Math.PI * 2);
      ctx.fill();
  
      // Store screen position and data for hit-testing (only relevant ones)
      historyScreenPositionsRef.current.push({
        x: screenX,
        y: screenY,
        data: historyItem
      });
    });
  }, [camera, tardigradeHistory, tardigradePosition, cellSize, tardigradeSize]);
  

  const drawtardigrade = useCallback((ctx: CanvasRenderingContext2D) => {
    const screenX = tardigradePosition.x * cellSize - camera.x;
    const screenY = tardigradePosition.y * cellSize - camera.y;
  
    // Ensure canvasRef.current is not undefined and access the canvas width and height
    if (canvasRef.current) {
      const canvasWidth = canvasRef.current.width;
      const canvasHeight = canvasRef.current.height;
  
      // Check if tardigrade is within the canvas bounds before drawing
      if (screenX + tardigradeSize / 2 > 0 && screenX - tardigradeSize / 2 < canvasWidth &&
          screenY + tardigradeSize / 2 > 0 && screenY - tardigradeSize / 2 < canvasHeight) {
        
        // Draw tardigrade image if it's loaded
        if (tardigradeImageRef.current) {
          ctx.drawImage(tardigradeImageRef.current, screenX - tardigradeSize / 2, screenY - tardigradeSize / 2, tardigradeSize, tardigradeSize);
        }
  
        // Draw label below the tardigrade
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';  // This can be optimized if the font size/style doesn't change
        ctx.fillText('Tardi', screenX - 20, screenY + tardigradeSize * 0.5);
      }
    }
  }, [camera, tardigradePosition, cellSize, tardigradeSize]);

  useEffect(() => {
    return () => {
      // Cancel the animation frame if it exists
      if (animationRef.current !== undefined && animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
  
    const ctx = canvas.getContext('2d')
    if (!ctx) return
  
    // Optionally, set canvas size based on container dimensions
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  
    // Clear the canvas before drawing everything
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  
    // Draw grid, dots, tardigrade history, and tardigrade
    drawGrid(ctx, canvas.width, canvas.height)
    drawDots(ctx, canvas.width, canvas.height)
    drawtardigradeHistory(ctx)
    drawtardigrade(ctx)
  
  }, [drawGrid, drawDots, drawtardigradeHistory, drawtardigrade]);
  
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
  
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
  
      const pixelRatio = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
  
      // Set canvas width and height according to pixel ratio for Retina displays
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
  
      // Style width and height remain the same
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
  
      // Scale the context to match the pixel ratio
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  
      // Re-render the canvas
      render();
    };
  
    // Add resize event listener
    window.addEventListener('resize', handleResize);
    
    // Trigger resize handler once on component mount
    handleResize();
  
    // Clean up on component unmount
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [render]); // Only re-run when `render` changes
  

  useEffect(() => {
    render();
  }, [cellSize, dotSize, tardigradeSize]); // Only rerun when these values change
  

  const handleZoom = (event: WheelEvent) => {
    event.preventDefault();
    
    const zoomFactor = 1.05;
    const canvas = canvasRef.current;
    if (canvas) {
      // Cancel ongoing animation when zooming
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        setIsLocating(false);
      }
  
      const scale = event.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
  
      // Apply zoom factor to cell size, dot size, and tardigrade size
      setCellSize(prev => prev * scale);
      setDotSize(prev => prev * scale);
      settardigradeSize(prev => prev * scale);
  
      render(); // Re-render the grid and other elements
    }
  };
  

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleZoom);
    }
    return () => {
      if (canvas) {
        canvas.removeEventListener('wheel', handleZoom);
      }
    };
  }, [handleZoom]);
    useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) { // Left click
      setIsDragging(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
  
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        setIsLocating(false);
      }
    } else if (e.button === 2) { // Right click
      render(); // Only trigger render if there's a specific reason
    }
  
    // Logic for selecting a history item when not dragging
    if (!isDragging && hoveredHistoryItem) {
      setSelectedHistoryItem(hoveredHistoryItem);
      setIsDrawerOpen(true);
      setMousePos({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredHistoryItem(null); // Reset hover if dragging
    }
  };
  

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setCamera(prev => ({ x: prev.x - dx, y: prev.y - dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else {
      // Hit-test historical positions
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
  
        // Check if hovered item is different from the previous one to avoid unnecessary state updates
        const hoverItem = historyScreenPositionsRef.current.find(pos => {
          const dx = x - pos.x;
          const dy = y - pos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance <= tardigradeSize / 2; // Increased hit area
        });
  
        if (hoverItem && hoveredHistoryItem !== hoverItem.data) {
          setHoveredHistoryItem(hoverItem.data); // Only update if there's a change
        } else if (!hoverItem) {
          setHoveredHistoryItem(null); // Reset if no hover
        }
      }
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  };
  

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  useEffect(() => {
    render();
  }, [cellSize, dotSize, tardigradeSize, render]);

  // Update locatetardigrade function
  const locatetardigrade = (zoom?: boolean) => {
    const targetX = tardigradePosition.x * cellSize - window.innerWidth / 2
    const targetY = tardigradePosition.y * cellSize - window.innerHeight / 2

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    setIsLocating(true)

    // Set the zoom level to the default value
    if (zoom) {
      setCellSize(40)
      setDotSize(6)
      settardigradeSize(50)
    }

    const animate = () => {
      setCamera(prev => {
        const dx = targetX - prev.x
        const dy = targetY - prev.y

        // If we're close enough, stop animating
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          setIsLocating(false)
          return { x: targetX, y: targetY }
        }
        return {
          x: prev.x + dx * 0.1,
          y: prev.y + dy * 0.1
        }
      })
      // Continue animation if we're not at target
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    setIsDragging(true);
    setLastMousePos({ x: touch.clientX, y: touch.clientY });
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      setIsLocating(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isDragging) {
      const touch = e.touches[0];
      const dx = touch.clientX - lastMousePos.x;
      const dy = touch.clientY - lastMousePos.y;
      setCamera(prev => ({ x: prev.x - dx, y: prev.y - dy }));
      setLastMousePos({ x: touch.clientX, y: touch.clientY });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="cursor-move"
      />
      {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-white/20">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>}

      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <Button
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) {
              if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                setIsLocating(false);
              }
              setCellSize(prev => prev * 1.2)
              setDotSize(prev => prev * 1.2)
              settardigradeSize(prev => prev * 1.2)
              render()
            }
          }}
          className="w-10 h-10 rounded-full bg-stone-900 border border-stone-600 text-xl"
        >
          +
        </Button>
        <Button
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) {
              if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                setIsLocating(false);
              }
              setCellSize(prev => prev * 0.8)
              setDotSize(prev => prev * 0.8)
              settardigradeSize(prev => prev * 0.8)
              render()
            }
          }}
          className="w-10 h-10 rounded-full bg-stone-900 border border-stone-600 text-xl"
        >
          -
        </Button>
      </div>

      <Button onClick={() => locatetardigrade(true)} className="fixed bottom-4 md:left-1/2 md:-translate-x-1/2 bg-stone-900 border border-stone-600 left-4 font-bold flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Locate the Tardigrade 
      </Button>

      <div className="fixed top-4 left-4 flex gap-2">
        <a
          href="https://x.com/tardionchain"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-stone-900 border border-stone-600 p-2 rounded-full shadow"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
          </svg>
        </a>
        <a
          href="https://t.me/tardionchain"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-stone-900 border border-stone-600 p-2 rounded-full shadow"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.2 5L2.5 12.8c-1.1.4-1.1 1.1-.2 1.4l4.7 1.5 1.8 5.6c.2.7.7.7 1 .4l2.8-2.3 5.5 4.2c1 .5 1.7.2 2-1l3.7-17.4c.4-1.5-.4-2.1-1.6-1.7z" />
          </svg>
        </a>
        <a
          href="https://pump.fun/coin/DTTLrCGbqn6fmNuKjGYqWFeQU5Hz153f5C3pNnxepump"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-stone-900 border aspect-square border-stone-600 p-2 rounded-full shadow"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#fff" viewBox="0 0 16 16">
            <path d="M1.828 8.9 8.9 1.827a4 4 0 1 1 5.657 5.657l-7.07 7.071A4 4 0 1 1 1.827 8.9Zm9.128.771 2.893-2.893a3 3 0 1 0-4.243-4.242L6.713 5.429z"/>
          </svg>
        </a>
        <a
          href="https://github.com/xerx0x/tardigrade"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-stone-900 border border-stone-600 p-2 rounded-full shadow"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
          </svg>
        </a>
      </div>
      
      <div className="fixed left-4 bottom-4 h-fit gap-2 w-72 max-w-72 flex flex-col">
          <a
            href="https://docs.tardionchain.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-300 hover:text-blue-400 flex bg-stone-900 border border-stone-600 w-full h-fit p-2 rounded-md items-center gap-1"
          >
            Read the docs <ExternalLink className="h-3 w-3" />
          </a>
          <AnimatedText />
      </div>

      <div className="absolute top-4 right-4 flex flex-col items-end">
        <div className="bg-stone-900 border border-stone-600 text-gray-200 rounded shadow max-h-[300px] w-[250px] overflow-y-auto">
          <div className="flex gap-2 mb-3 sticky top-0 bg-stone-900 p-2 z-10">
            <button
              className={`text-sm font-medium px-3 py-1 rounded-t border-b-2 ${activeTab === 'history' ? 'text-gray-200 border-gray-400' : 'text-gray-300 border-transparent hover:text-gray-400'}`}
              onClick={() => setActiveTab('history')}
            >
              History
            </button>
            <button
              className={`text-sm font-medium px-3 py-1 rounded-t border-b-2 ${activeTab === 'recent' ? 'text-gray-200 border-gray-400' : 'text-gray-300 border-transparent hover:text-gray-400'}`}
              onClick={() => setActiveTab('recent')}
            >
              Recent Inputs
            </button>
          </div>
          {activeTab === 'history' ? (
            <ul className="space-y-2 px-4">
              {tardigradeHistory.sort((a, b) => b.index - a.index).map((pos, index) => (
                <li
                  key={index}
                  className="text-xs text-gray-200 flex justify-between py-0.5 cursor-pointer rounded"
                  onClick={() => {
                    setIsDrawerOpen(true);
                    setSelectedHistoryItem(pos)
                  }}
                >
                  <span className="font-mono">({pos.x}, {pos.y})</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">{pos.direction}</span>
                    <span className="text-gray-300">
                      {tardigradeHistory.length - index - 1 === 0
                        ? 'now'
                        : `${Math.floor((Date.now() - pos.timestamp) / 1000) < 60
                          ? `${Math.floor((Date.now() - pos.timestamp) / 1000)}s ago`
                          : Math.floor((Date.now() - pos.timestamp) / 60000) < 60
                            ? `${Math.floor((Date.now() - pos.timestamp) / 60000)}m ago`
                            : `${Math.floor((Date.now() - pos.timestamp) / 3600000)}h ago`}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2 px-4">
              {recentTransactions.length === 0 && (
                <div className="flex items-center justify-center pb-2 -mt-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm">Waiting for inputs (txs)...</span>
                </div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-200">
                    <th className="text-left pb-2">Time</th>
                    <th className="text-left pb-2">From</th>
                    <th className="text-right pb-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx, index) => {
                    const timeAgo = tx.blockTime
                      ? Math.floor((Date.now() - tx.blockTime * 1000) / 1000) < 60
                        ? `${Math.floor((Date.now() - tx.blockTime * 1000) / 1000)}s ago`
                        : Math.floor((Date.now() - tx.blockTime * 1000) / 60000) < 60
                          ? `${Math.floor((Date.now() - tx.blockTime * 1000) / 60000)}m ago`
                          : `${Math.floor((Date.now() - tx.blockTime * 1000) / 3600000)}h ago`
                      : 'Pending';

                    const amount = (Number(tx.amount) / 1e9).toFixed(2);

                    return (
                      <tr
                        key={index}
                        className="text-xs text-gray-300 cursor-pointer"
                        onClick={() => window.open(`https://solscan.io/tx/${tx.signature}`, '_blank')}
                      >
                        <td className="py-1">{timeAgo}</td>
                        <td className="py-1">
                          <span className="bg-black px-2 py-0.5 rounded-full">
                            {shortenHash(tx.from)}
                          </span>
                        </td>
                        <td className="text-right py-1">{amount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ul>
          )}
        </div>
      </div>
      {hoveredHistoryItem && (
        <ImprovedTooltip
          mousePos={mousePos}
          hoveredHistoryItem={hoveredHistoryItem}
          tardigradePosition={tardigradePosition}
          tardigradeHistory={tardigradeHistory}
        />
      )}

      <Dialog open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DialogContent className="sm:max-w-[600px] bg-stone-900 border border-stone-600 text-gray-200">
          <div className="relative">
            <img
              src="/tardi.png"
              alt="Tardi"
              className={`w-16 h-16 mx-auto ${selectedHistoryItem?.x !== tardigradePosition.x || selectedHistoryItem?.y !== tardigradePosition.y ? 'grayscale opacity-60' : ''}`}
            />
            {(selectedHistoryItem?.x !== tardigradePosition.x || selectedHistoryItem?.y !== tardigradePosition.y) && (
              <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">
                ?
              </div>
            )}
          </div>
          <DialogHeader>
            <DialogTitle>
              {selectedHistoryItem?.x === tardigradePosition.x && selectedHistoryItem?.y === tardigradePosition.y
                ? 'Current tardigrade Position'
                : selectedHistoryItem?.index === 0
                  ? 'GENESIS Position'
                  : `${tardigradeHistory.length - (selectedHistoryItem?.index || 0)} steps ago`}
            </DialogTitle>
          </DialogHeader>
          {selectedHistoryItem && (
            <div className="mt-2 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Position:</span>
                <div className="flex items-center gap-2">
                  <span>({selectedHistoryItem.x}, {selectedHistoryItem.y})</span>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Inputs ({selectedHistoryItem.affectedTransactions.length})</h4>
                <ScrollArea className="h-[200px]">
                  <div className="flex gap-1 flex-wrap">
                    {selectedHistoryItem.affectedTransactions.map((tx, i) => (
                      <Badge key={i} variant="secondary" className="cursor-pointer bg-stone-950 hover:bg-black text-gray-300">
                        <a
                          href={`https://solscan.io/tx/${tx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1"
                        >
                          {shortenHash(tx)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Badge>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div>
                <span className="font-semibold">Neural Output:</span>{' '}
                {selectedHistoryItem.direction.charAt(0).toUpperCase() + selectedHistoryItem.direction.slice(1)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

<style jsx>{`
  .drawer {
    transition: transform 0.3s ease-in-out;
    transform: translateY(100%);
  }
  .drawer-open {
    transform: translateY(0);
  }
`}</style>
