import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({ children, className = '', variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return <button className={`${styles.button} ${styles[variant]} ${className}`.trim()} type={type} {...props}>{props.disabled && <i className={styles.loader} aria-hidden="true" />}{children}</button>
}
