import { FormEvent, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import login_page_logo from '../assets/login_page_logo.svg';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AuthRole } from '../types';
import { sendRestaurantOtp } from '../api/authApi';
import { sendOwnerOtp } from '../api/ownerApi';

type LoginMode = 'otp' | 'password';
type OtpStep = 'phone' | 'verify';

const LoginPage = () => {
  const { login, loginWithOtp } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Common State
  const [role, setRole] = useState<AuthRole>('restaurant');
  const [loginMode, setLoginMode] = useState<LoginMode>('otp'); // Initial default: OTP
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP Login State
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('phone');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Username/Password Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  useEffect(() => {
    const expired = sessionStorage.getItem('hivago_session_expired');
    if (expired === 'true') {
      showToast('Your session has expired. Please log in again.', 'warning');
      sessionStorage.removeItem('hivago_session_expired');
    }
  }, [showToast]);

  // Focus first OTP box automatically when entering verification step
  useEffect(() => {
    if (loginMode === 'otp' && otpStep === 'verify') {
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loginMode, otpStep]);

  // Resend Timer Countdown
  useEffect(() => {
    let timer: any;
    if (resendTimer > 0) {
      timer = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendTimer]);

  // Handle Send OTP
  const handleSendOtp = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    setError(null);

    const cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      const msg = 'Please enter a valid 10-digit mobile number.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setIsSendingOtp(true);
    try {
      if (role === 'owner') {
        await sendOwnerOtp(cleanedPhone);
      } else {
        await sendRestaurantOtp(cleanedPhone);
      }
      showToast(`OTP sent to +91 ${cleanedPhone}`, 'success');
      setOtpStep('verify');
      setOtpDigits(['', '', '', '', '', '']);
      setResendTimer(30);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Unable to send OTP. Please try again.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Handle Seamless OTP Input Changes
  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const newDigits = [...otpDigits];
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    // Handle pasting multiple digits into a box
    if (cleaned.length > 1) {
      const digitsArr = cleaned.slice(0, 6).split('');
      const newDigits = [...otpDigits];
      digitsArr.forEach((d, i) => {
        if (index + i < 6) {
          newDigits[index + i] = d;
        }
      });
      setOtpDigits(newDigits);
      const nextIndex = Math.min(index + digitsArr.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    // Single digit entry
    const newDigits = [...otpDigits];
    newDigits[index] = cleaned;
    setOtpDigits(newDigits);

    // Auto advance focus
    if (cleaned && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Keyboard events: Backspace, Arrow keys, and Enter key submission
  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        const newDigits = [...otpDigits];
        newDigits[index - 1] = '';
        setOtpDigits(newDigits);
        otpInputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...otpDigits];
        newDigits[index] = '';
        setOtpDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const currentOtp = otpDigits.join('');
      if (currentOtp.length >= 4) {
        submitOtpLogin(currentOtp);
      }
    }
  };

  // Clipboard Paste handler
  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedText) return;

    const digitsArr = pastedText.split('');
    const newDigits = ['', '', '', '', '', ''];
    digitsArr.forEach((d, i) => {
      newDigits[i] = d;
    });
    setOtpDigits(newDigits);

    const focusIdx = Math.min(digitsArr.length, 5);
    otpInputRefs.current[focusIdx]?.focus();
  };

  // Core Submit OTP Logic
  const submitOtpLogin = async (otpValue: string) => {
    setError(null);
    if (!otpValue || otpValue.trim().length < 4) {
      const msg = 'Please enter the verification OTP.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    const cleanedPhone = phone.replace(/\D/g, '');
    setLoading(true);

    try {
      await loginWithOtp(cleanedPhone, otpValue.trim(), role, remember);
      showToast('Successfully signed in!', 'success');
      if (role === 'owner') {
        navigate('/owner/outlets');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Invalid OTP code. Please try again.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    await submitOtpLogin(otpDigits.join(''));
  };

  // Handle Username/Password Login
  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password }, role, remember);
      showToast('Successfully signed in!', 'success');
      if (role === 'owner') {
        navigate('/owner/outlets');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      const message = err?.message || (err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (newRole: AuthRole) => {
    setRole(newRole);
    setError(null);
  };

  const switchLoginMode = (mode: LoginMode) => {
    setLoginMode(mode);
    setError(null);
    if (mode === 'otp') {
      setOtpStep('phone');
      setOtpDigits(['', '', '', '', '', '']);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 sm:px-6 sm:py-10 relative z-50">
      <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_rgba(15,23,42,0.12)] sm:p-10">
        
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-500 text-3xl text-white">
            <img src={login_page_logo} alt="Hivago" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Hivago</h1>
          <p className="mt-2 text-sm text-slate-500">Access for owners, managers and staff.</p>
        </div>

        {/* Role Selector Tabs (Restaurant / Owner) */}
        <div className="mb-6 flex rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleRoleChange('restaurant')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              role === 'restaurant' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Restaurant
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange('owner')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              role === 'owner' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Owner
          </button>
        </div>

        {/* Error Alert */}
        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* MODE 1: OTP LOGIN (DEFAULT) */}
        {loginMode === 'otp' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {otpStep === 'phone' ? (
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Mobile Number
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-4 text-sm font-semibold text-slate-500 select-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="Enter 10-digit mobile number"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full rounded-3xl border border-slate-200 bg-slate-50 pl-14 pr-4 py-3 text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 font-medium tracking-wide"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-500">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Remember me
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSendingOtp || phone.length < 10}
                  className="w-full rounded-3xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 shadow-md cursor-pointer"
                >
                  {isSendingOtp ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Enter Verification OTP
                    </label>
                    <button
                      type="button"
                      onClick={() => setOtpStep('phone')}
                      className="text-xs font-semibold text-brand-600 hover:underline cursor-pointer"
                    >
                      Change Number
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mb-3">
                    Code sent to <span className="font-semibold text-slate-900">+91 {phone}</span>
                  </p>

                  {/* 6 Digit Individual Number Boxes */}
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5 my-4">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={el => otpInputRefs.current[idx] = el}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleDigitChange(idx, e.target.value)}
                        onKeyDown={e => handleDigitKeyDown(idx, e)}
                        onPaste={handleDigitPaste}
                        className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-2xl border transition-all outline-none ${
                          digit 
                            ? 'border-brand-500 bg-brand-50/40 text-slate-900 shadow-sm ring-2 ring-brand-100' 
                            : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Didn't receive code?</span>
                  {resendTimer > 0 ? (
                    <span className="font-semibold text-slate-400">Resend in {resendTimer}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      disabled={isSendingOtp}
                      className="font-semibold text-brand-600 hover:text-brand-700 cursor-pointer"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || otpDigits.join('').length < 4}
                  className="w-full rounded-3xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 shadow-md cursor-pointer"
                >
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
              </form>
            )}

            {/* Toggle to Password Login */}
            <div className="pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => switchLoginMode('password')}
                className="text-sm font-medium text-slate-600 hover:text-brand-600 transition cursor-pointer"
              >
                Log in with <span className="font-semibold text-brand-600 underline">Username & Password</span> instead
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: USERNAME & PASSWORD LOGIN */}
        {loginMode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-5 animate-in fade-in duration-200">
            <label className="block text-sm font-medium text-slate-700">
              Email or Username
              <input
                type="text"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="Enter email or username"
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                required
              />
            </label>

            <div className="block text-sm font-medium text-slate-700">
              <span>Password</span>
              <div className="relative mt-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 pl-4 pr-12 py-3 text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={event => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Remember me
              </label>
              <button 
                type="button" 
                onClick={() => setShowForgotModal(true)}
                className="font-medium text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-3xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 shadow-md cursor-pointer"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>

            {/* Toggle to OTP Login */}
            <div className="pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => switchLoginMode('otp')}
                className="text-sm font-medium text-slate-600 hover:text-brand-600 transition cursor-pointer"
              >
                Log in with <span className="font-semibold text-brand-600 underline">Mobile Number (OTP)</span> instead
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[24px] border border-slate-200 shadow-2xl w-full max-w-[400px] p-6 sm:p-8 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-red-50 text-[#AD221F] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m-2-2a4 4 0 118 0v3H8v-3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Forgot Password?</h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              For security, self-service password reset is disabled. Please contact your system administrator or Hivago Support to reset your account.
            </p>
            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full py-3 text-sm font-semibold rounded-2xl bg-[#AD221F] hover:bg-red-800 text-white shadow-md transition-all active:scale-[0.98] cursor-pointer"
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
