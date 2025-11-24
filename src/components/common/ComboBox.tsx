import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface ComboBoxOption {
  value: string;
  label: string;
  type?: 'revenue' | 'expense' | 'asset';
}

interface ComboBoxProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowFreeText?: boolean;
  filterOptions?: boolean;
}

export const ComboBox: React.FC<ComboBoxProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select or type...",
  className = "",
  allowFreeText = true,
  filterOptions = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [filteredOptions, setFilteredOptions] = useState(options);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update input value when prop value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter options based on input
  useEffect(() => {
    if (filterOptions && inputValue) {
      const filtered = options.filter(opt =>
        opt.value.toLowerCase().includes(inputValue.toLowerCase()) ||
        opt.label.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions(options);
    }
  }, [inputValue, options, filterOptions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    if (allowFreeText) {
      onChange(newValue);
    }
    if (!isOpen && newValue) {
      setIsOpen(true);
    }
  };

  const handleOptionSelect = (option: ComboBoxOption) => {
    setInputValue(option.value);
    onChange(option.value);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      inputRef.current?.focus();
    }
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-2 py-1 pr-8 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg text-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={toggleDropdown}
          className="absolute right-0 top-0 bottom-0 px-2 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary rounded-r"
          aria-label="Toggle dropdown"
        >
          <ChevronDown
            className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.map((option, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleOptionSelect(option)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors flex flex-col"
            >
              <span className={`font-medium ${
                option.type === 'revenue'
                  ? 'text-green-600 dark:text-green-400'
                  : option.type === 'expense'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {option.value}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {option.label} {option.type === 'revenue' ? '(V)' : option.type === 'expense' ? '(A)' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ComboBox;