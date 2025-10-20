'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  CreditCard, 
  Receipt, 
  Settings, 
  ChevronRight,
  Home,
  MapPin,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface SidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const [isMappingsExpanded, setIsMappingsExpanded] = useState(false)

  const sections = [
    {
      id: 'overview',
      name: 'Overview',
      icon: Home,
      color: 'text-slate-600'
    },
    {
      id: 'orders',
      name: 'Orders',
      icon: Receipt,
      color: 'text-blue-600'
    },
    {
      id: 'payouts',
      name: 'Payouts',
      icon: CreditCard,
      color: 'text-emerald-600'
    },
    {
      id: 'mappings',
      name: 'Mappings',
      icon: MapPin,
      color: 'text-purple-600',
      hasSubsections: true
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: Settings,
      color: 'text-slate-600'
    }
  ]

  const mappingSubsections = [
    {
      id: 'mappings-orders',
      name: 'Orders',
      parent: 'mappings'
    },
    {
      id: 'mappings-products',
      name: 'Products',
      parent: 'mappings'
    },
    {
      id: 'mappings-fulfillments',
      name: 'Fulfillments',
      parent: 'mappings'
    },
    {
      id: 'mappings-other',
      name: 'Other transactions',
      parent: 'mappings'
    }
  ]

  return (
    <div className="w-64 bg-gradient-to-b from-slate-50 to-white border-r border-slate-200 h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-lg">Pirani Sync</h1>
            <p className="text-xs text-slate-500">Payout Management</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {sections.map((section) => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            const isMappingsActive = activeSection.startsWith('mappings-')
            const shouldShowMappings = section.id === 'mappings'
            
            return (
              <div key={section.id}>
                <Button
                  variant={isActive || (shouldShowMappings && isMappingsActive) ? "default" : "ghost"}
                  onClick={() => {
                    if (shouldShowMappings) {
                      setIsMappingsExpanded(!isMappingsExpanded)
                      if (!isMappingsExpanded) {
                        onSectionChange('mappings-orders') // Default to Orders when expanding
                      }
                    } else {
                      onSectionChange(section.id)
                    }
                  }}
                  className={`w-full justify-start gap-3 h-12 ${
                    isActive || (shouldShowMappings && isMappingsActive)
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-md' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{section.name}</span>
                  {shouldShowMappings && (
                    isMappingsExpanded ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />
                  )}
                  {isActive && !shouldShowMappings && <ChevronRight className="h-4 w-4 ml-auto" />}
                </Button>
                
                {/* Mapping Subsections */}
                {shouldShowMappings && isMappingsExpanded && (
                  <div className="ml-6 mt-2 space-y-1">
                    {mappingSubsections.map((subsection) => {
                      const isSubsectionActive = activeSection === subsection.id
                      return (
                        <Button
                          key={subsection.id}
                          variant={isSubsectionActive ? "default" : "ghost"}
                          onClick={() => onSectionChange(subsection.id)}
                          className={`w-full justify-start gap-3 h-10 text-sm ${
                            isSubsectionActive
                              ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md' 
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                        >
                          <span className="font-medium">{subsection.name}</span>
                          {isSubsectionActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                        </Button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200">
        <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 border-emerald-200">
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-xs text-slate-600 mb-1">Pirani Life</div>
              <div className="text-sm font-medium text-slate-800">Shopify ↔ NetSuite</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
