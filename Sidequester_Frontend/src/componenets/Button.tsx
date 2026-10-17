import React from 'react';
import {colors} from '../constants/colors';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  onClick,
  disabled = false,
  children,
  ...rest
}) => {
  return (
    <button className="cursor-pointer rounded px-4 py-2"
      style={{
        backgroundColor: colors.secondary,
        borderColor: colors.border,
      }}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;