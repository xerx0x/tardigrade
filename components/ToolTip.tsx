"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface HistoryItem {
  x: number
  y: number
  affectedTransactions: string[]
}

interface TooltipProps {
  mousePos: { x: number; y: number }
  hoveredHistoryItem: HistoryItem | null
  tardigradePosition: { x: number; y: number }
  tardigradeHistory: HistoryItem[]
}

export function ImprovedTooltip({
  mousePos = { x: 0, y: 0 },
  hoveredHistoryItem = null,
  tardigradePosition = { x: 0, y: 0 },
  tardigradeHistory = []
}: TooltipProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient || !hoveredHistoryItem) {
    return null
  }

  const shortenHash = (hash: string) => `${hash.slice(0, 4)}...${hash.slice(-4)}`

  const isCurrentPosition = hoveredHistoryItem.x === tardigradePosition.x && hoveredHistoryItem.y === tardigradePosition.y
  const positionIndex = tardigradeHistory.findIndex(item => item.x === hoveredHistoryItem.x && item.y === hoveredHistoryItem.y)
  const isGenesisPosition = positionIndex === 0
  const stepsAgo = tardigradeHistory.length - positionIndex;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        left: `${mousePos.x + 10}px`,
        top: `${mousePos.y + 10}px`
      }}
      className="bg-black/90 backdrop-blur-sm shadow-lg rounded-lg p-4 text-sm border border-stone-600 max-w-xs"
    >
      <div className="mb-2">
        <div className="relative">
          <img
            src="/tardi.png"
            alt="Tardi"
            className={`w-16 h-16 mx-auto ${!isCurrentPosition ? 'grayscale opacity-30' : ''}`}
          />
          {!isCurrentPosition && (
            <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-500">
              ?
            </div>
          )}
        </div>
      </div>
      <div className="font-medium text-gray-200 mb-2">
        {isCurrentPosition ? (
          <span className="text-green-600">Current Position</span>
        ) : isGenesisPosition ? (
          <span className="text-blue-600">Genesis Position</span>
        ) : (
          <span>{stepsAgo} steps ago</span>
        )}
      </div>
      <div className="space-y-2 text-gray-300">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Position:</span>
          <span className="font-mono bg-stone-800 px-2 py-1 rounded">
            ({hoveredHistoryItem.x}, {hoveredHistoryItem.y})
          </span>
        </div>
        <div>
          <span className="text-gray-300 block mb-1">Activators:</span>
          <div className="flex flex-wrap gap-1">
            {hoveredHistoryItem.affectedTransactions.slice(0, 3).map((tx, i) => (
              <a
                key={i}
                href={`https://solscan.io/tx/${tx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-stone-800 px-2 py-1 rounded text-xs hover:bg-gray-200 transition-colors inline-block"
              >
                {shortenHash(tx)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
