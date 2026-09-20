import { Injectable, inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';

export type SpatialDirection = 'up' | 'down' | 'left' | 'right';

@Injectable({
    providedIn: 'root',
})
export class TvNavigationService {
    private readonly ngZone = inject(NgZone);
    private readonly router = inject(Router);

    private isTvModeActive = false;
    private currentFocusedElement: HTMLElement | null = null;
    private isInitialized = false;

    /**
     * Start listening for TV remote / D-Pad navigation events.
     */
    init(): void {
        if (this.isInitialized || typeof window === 'undefined') {
            return;
        }
        this.isInitialized = true;

        // Run outside Angular zone for fast keydown capture, re-enter zone only when executing actions
        this.ngZone.runOutsideAngular(() => {
            window.addEventListener('keydown', (event) => this.handleKeyDown(event), {
                capture: true,
            });

            // If mouse moves significantly, allow standard interaction
            window.addEventListener('mousemove', () => {
                if (this.isTvModeActive && this.currentFocusedElement) {
                    this.currentFocusedElement.classList.remove('tv-focused');
                }
            });
        });
    }

    private handleKeyDown(event: KeyboardEvent): void {
        const key = event.key;

        // Activate TV mode visually whenever D-pad / TV remote keys are used
        if (
            [
                'ArrowUp',
                'ArrowDown',
                'ArrowLeft',
                'ArrowRight',
                'Select',
                'Enter',
                'Escape',
                'GoBack',
                'BrowserBack',
            ].includes(key)
        ) {
            if (!this.isTvModeActive) {
                this.isTvModeActive = true;
                document.body.classList.add('tv-mode');
            }
        }

        switch (key) {
            case 'ArrowUp':
                this.onDirectionKey(event, 'up');
                break;
            case 'ArrowDown':
                this.onDirectionKey(event, 'down');
                break;
            case 'ArrowLeft':
                this.onDirectionKey(event, 'left');
                break;
            case 'ArrowRight':
                this.onDirectionKey(event, 'right');
                break;
            case 'Enter':
            case 'Select':
                this.onSelectKey(event);
                break;
            case 'Escape':
            case 'GoBack':
            case 'BrowserBack':
                this.onBackKey(event);
                break;
            case 'MediaPlayPause':
            case 'MediaPlay':
            case 'MediaPause':
                this.onMediaPlayPause(event);
                break;
        }
    }

    private onDirectionKey(event: KeyboardEvent, direction: SpatialDirection): void {
        const active = document.activeElement as HTMLElement | null;

        // If typing in input and pressing left/right, let the input cursor move normally
        if (
            active &&
            (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
            (direction === 'left' || direction === 'right')
        ) {
            return;
        }

        const candidates = this.getFocusableCandidates();
        if (candidates.length === 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const current =
            active && this.isValidTarget(active)
                ? active
                : this.currentFocusedElement && this.isValidTarget(this.currentFocusedElement)
                  ? this.currentFocusedElement
                  : null;

        if (!current) {
            this.setFocus(candidates[0]);
            return;
        }

        const next = this.findNearestCandidate(current, candidates, direction);
        if (next) {
            this.setFocus(next);
        }
    }

    private onSelectKey(event: KeyboardEvent): void {
        const active = document.activeElement as HTMLElement | null;
        const target = active ?? this.currentFocusedElement;

        if (!target) {
            return;
        }

        // Standard buttons and links handle Enter natively
        if (
            target.tagName === 'BUTTON' ||
            target.tagName === 'A' ||
            target.tagName === 'INPUT'
        ) {
            return;
        }

        // For clickable divs or custom components (e.g. channel items), simulate click
        event.preventDefault();
        this.ngZone.run(() => {
            target.click();
        });
    }

    private onBackKey(event: KeyboardEvent): void {
        event.preventDefault();
        event.stopPropagation();

        this.ngZone.run(() => {
            // 1. If inside fullscreen video player, exit fullscreen
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
                return;
            }

            // 2. If a dialog or menu overlay is open, close it
            const dialogCloseBtn = document.querySelector<HTMLElement>(
                '.cdk-overlay-container [mat-dialog-close], .cdk-overlay-container .close-button'
            );
            if (dialogCloseBtn) {
                dialogCloseBtn.click();
                return;
            }

            // 3. If focused inside content or list, move focus to sidebar/rail
            const railFirstItem = document.querySelector<HTMLElement>(
                'app-workspace-shell-rail a, .workspace-rail a'
            );
            if (railFirstItem && document.activeElement !== railFirstItem) {
                const isInsideContent = !document.activeElement?.closest(
                    'app-workspace-shell-rail, .workspace-rail'
                );
                if (isInsideContent) {
                    this.setFocus(railFirstItem);
                    return;
                }
            }

            // 4. Default: navigate back in browser history
            if (window.history.length > 1) {
                window.history.back();
            }
        });
    }

    private onMediaPlayPause(event: KeyboardEvent): void {
        event.preventDefault();
        const video = document.querySelector('video');
        if (video) {
            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        }
    }

    private setFocus(element: HTMLElement): void {
        if (this.currentFocusedElement) {
            this.currentFocusedElement.classList.remove('tv-focused');
        }

        this.currentFocusedElement = element;
        element.classList.add('tv-focused');

        element.focus({ preventScroll: true });

        // Ensure visible in TV viewport
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
        });
    }

    private getFocusableCandidates(): HTMLElement[] {
        const selector = [
            'button:not([disabled])',
            'a[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
            '.channel-list-item',
            '.channel-content',
            '.workspace-rail-item',
            '.rail-link',
            '.mat-mdc-list-item',
            '.mat-mdc-button',
            '.mat-mdc-icon-button',
            '[role="button"]',
            '[role="tab"]',
        ].join(',');

        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
        return nodes.filter((el) => this.isValidTarget(el));
    }

    private isValidTarget(el: HTMLElement): boolean {
        if (!el || el.offsetParent === null) {
            return false;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return false;
        }

        // Exclude elements inside inert or hidden containers
        if (el.closest('[inert]') || el.closest('[aria-hidden="true"]')) {
            return false;
        }

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }

        return true;
    }

    private findNearestCandidate(
        current: HTMLElement,
        candidates: HTMLElement[],
        direction: SpatialDirection
    ): HTMLElement | null {
        const cRect = current.getBoundingClientRect();
        const cCenter = {
            x: cRect.left + cRect.width / 2,
            y: cRect.top + cRect.height / 2,
        };

        let bestCandidate: HTMLElement | null = null;
        let minScore = Infinity;

        for (const candidate of candidates) {
            if (candidate === current || candidate.contains(current) || current.contains(candidate)) {
                continue;
            }

            const tRect = candidate.getBoundingClientRect();
            const tCenter = {
                x: tRect.left + tRect.width / 2,
                y: tRect.top + tRect.height / 2,
            };

            const dx = tCenter.x - cCenter.x;
            const dy = tCenter.y - cCenter.y;

            let isPrimaryDirection = false;
            let primaryDist = 0;
            let orthogonalDist = 0;
            let hasOrthogonalOverlap = false;

            switch (direction) {
                case 'down':
                    isPrimaryDirection = tRect.top >= cRect.top + 4 && dy > 0;
                    primaryDist = dy;
                    orthogonalDist = Math.abs(dx);
                    hasOrthogonalOverlap = tRect.left < cRect.right && tRect.right > cRect.left;
                    break;
                case 'up':
                    isPrimaryDirection = tRect.bottom <= cRect.bottom - 4 && dy < 0;
                    primaryDist = -dy;
                    orthogonalDist = Math.abs(dx);
                    hasOrthogonalOverlap = tRect.left < cRect.right && tRect.right > cRect.left;
                    break;
                case 'right':
                    isPrimaryDirection = tRect.left >= cRect.left + 4 && dx > 0;
                    primaryDist = dx;
                    orthogonalDist = Math.abs(dy);
                    hasOrthogonalOverlap = tRect.top < cRect.bottom && tRect.bottom > cRect.top;
                    break;
                case 'left':
                    isPrimaryDirection = tRect.right <= cRect.right - 4 && dx < 0;
                    primaryDist = -dx;
                    orthogonalDist = Math.abs(dy);
                    hasOrthogonalOverlap = tRect.top < cRect.bottom && tRect.bottom > cRect.top;
                    break;
            }

            if (!isPrimaryDirection) {
                continue;
            }

            // Weight orthogonal distance heavier unless there is column/row overlap
            const overlapBonus = hasOrthogonalOverlap ? 0.3 : 1.0;
            const score = primaryDist + orthogonalDist * 2.5 * overlapBonus;

            if (score < minScore) {
                minScore = score;
                bestCandidate = candidate;
            }
        }

        return bestCandidate;
    }
}
