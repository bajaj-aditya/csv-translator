"use client"

import * as React from "react"
import { Check, ChevronDown, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SUPPORTED_LANGUAGES } from "@/constants"
import type { Language } from "@/types"

interface LanguageSelectProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  variant?: "single" | "multi"
}

interface MultiLanguageSelectProps {
  values: string[]
  onValuesChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  maxSelections?: number
}

export function LanguageSelect({
  value,
  onValueChange,
  placeholder = "Select language",
  disabled = false,
  className,
}: LanguageSelectProps) {
  const selectedLanguage = SUPPORTED_LANGUAGES.find(lang => lang.code === value)

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <div className="flex items-center space-x-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder={placeholder}>
            {selectedLanguage && (
              <span>
                {selectedLanguage.nativeName} ({selectedLanguage.name})
              </span>
            )}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((language) => (
          <SelectItem
            key={language.code}
            value={language.code}
            className="flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <span className="font-medium">{language.nativeName}</span>
              <span className="text-sm text-muted-foreground">
                ({language.name})
              </span>
            </div>
            {value === language.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MultiLanguageSelect({
  values,
  onValuesChange,
  placeholder = "Select languages",
  disabled = false,
  className,
  maxSelections = 10,
}: MultiLanguageSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selectedLanguages = SUPPORTED_LANGUAGES.filter(lang => 
    values.includes(lang.code)
  )

  const availableLanguages = SUPPORTED_LANGUAGES.filter(lang => 
    !values.includes(lang.code)
  )

  const handleLanguageToggle = (languageCode: string) => {
    if (values.includes(languageCode)) {
      onValuesChange(values.filter(code => code !== languageCode))
    } else if (values.length < maxSelections) {
      onValuesChange([...values, languageCode])
    }
  }

  const handleRemoveLanguage = (languageCode: string) => {
    onValuesChange(values.filter(code => code !== languageCode))
  }

  const handleClearAll = () => {
    onValuesChange([])
  }

  return (
    <div className={cn("w-full space-y-2", className)}>
      <Select
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {selectedLanguages.length > 0
                  ? `${selectedLanguages.length} language${selectedLanguages.length !== 1 ? 's' : ''} selected`
                  : placeholder}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {selectedLanguages.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedLanguages.length}/{maxSelections}
                </Badge>
              )}
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Available Languages</span>
              {selectedLanguages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-6 px-2 text-xs"
                >
                  Clear all
                </Button>
              )}
            </div>
            {availableLanguages.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-2">
                {values.length >= maxSelections
                  ? "Maximum languages selected"
                  : "No more languages available"}
              </div>
            ) : (
              availableLanguages.map((language) => (
                <div
                  key={language.code}
                  className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer"
                  onClick={() => handleLanguageToggle(language.code)}
                >
                  <div>
                    <span className="font-medium text-sm">{language.nativeName}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({language.name})
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={values.length >= maxSelections}
                  >
                    +
                  </Button>
                </div>
              ))
            )}
          </div>
        </SelectContent>
      </Select>

      {/* Selected Languages */}
      {selectedLanguages.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-lg">
          {selectedLanguages.map((language) => (
            <Badge
              key={language.code}
              variant="secondary"
              className="text-xs flex items-center space-x-1"
            >
              <span>{language.nativeName}</span>
              <button
                onClick={() => handleRemoveLanguage(language.code)}
                disabled={disabled}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5 transition-colors"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// Source Language Select Component
export function SourceLanguageSelect(props: Omit<LanguageSelectProps, 'variant'>) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Source Language</label>
      <LanguageSelect
        {...props}
        placeholder="Select source language"
      />
    </div>
  )
}

// Target Language Select Component  
export function TargetLanguageSelect({
  isMulti = false,
  ...props
}: Omit<LanguageSelectProps, 'variant'> & Omit<MultiLanguageSelectProps, 'values' | 'onValuesChange'> & {
  isMulti?: boolean
  values?: string[]
  onValuesChange?: (values: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Target Language{isMulti ? 's' : ''}
      </label>
      {isMulti ? (
        <MultiLanguageSelect
          values={props.values || []}
          onValuesChange={props.onValuesChange || (() => {})}
          placeholder="Select target languages"
          disabled={props.disabled}
          className={props.className}
          maxSelections={props.maxSelections}
        />
      ) : (
        <LanguageSelect
          {...props}
          placeholder="Select target language"
        />
      )}
    </div>
  )
}
