export async function processInfractions<TProps = any>(
    vm: TProps,
    infractions: Array<Function | string>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    // TODO: Implement infractions processing
    return () => {
        // Cleanup
    };
}
